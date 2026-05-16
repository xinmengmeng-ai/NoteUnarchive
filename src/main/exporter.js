'use strict';

const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { toHtml } = require('./converter/html');
const { toJson } = require('./converter/json');
const { toMarkdown } = require('./converter/markdown');
const sourceRegistry = require('./sources');

const EXTENSIONS = {
  markdown: '.md',
  json: '.json',
  html: '.html',
};

function safeName(value) {
  let name = String(value || 'Untitled')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  for (const suffix of ['.note', '.mindmap', '.md']) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length).trim();
      break;
    }
  }
  return (name || 'untitled').slice(0, 120);
}

function normalizeManifestPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function noteModifiedSeconds(note) {
  const modified = normalizeTimestampMs(note.modified || 0);
  return Math.floor(modified / 1000);
}

function normalizeTimestampMs(value) {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 100000000000 ? timestamp * 1000 : timestamp;
}

class Exporter extends EventEmitter {
  constructor({ history } = {}) {
    super();
    this._history = history || null;
    this._cancelled = false;
    this._paused = false;
  }

  pause() {
    this._paused = true;
    return true;
  }

  resume() {
    this._paused = false;
    return true;
  }

  cancel() {
    this._cancelled = true;
    return true;
  }

  async _waitIfPaused() {
    while (this._paused && !this._cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async start(config) {
    const notes = this._collectNotes(config);
    const summary = {
      source: config.source,
      account: config.account || '',
      format: config.format,
      noteCount: notes.length,
      attachmentCount: 0,
      totalBytes: 0,
      destPath: config.destinationDir,
      status: 'COMPLETED',
      notesExported: 0,
      notesSkipped: 0,
      notesError: 0,
      config,
    };
    const checksums = [];

    ensureDir(config.destinationDir);

    for (let index = 0; index < notes.length; index += 1) {
      await this._waitIfPaused();
      if (this._cancelled) {
        summary.status = 'CANCELLED';
        break;
      }

      const note = notes[index];
      try {
        const result = this._exportNote(note, config);
        if (result.skipped) {
          summary.notesSkipped += 1;
          this.emit('log', { timestamp: new Date().toISOString(), message: `Skipped ${note.title}`, status: 'SKIPPED' });
        } else {
          summary.notesExported += 1;
          summary.attachmentCount += result.attachmentCount;
          summary.totalBytes += result.bytesWritten;
          checksums.push(...result.files.map((filePath) => `${sha256File(filePath)}  ${normalizeManifestPath(path.relative(config.destinationDir, filePath))}`));
          this.emit('log', { timestamp: new Date().toISOString(), message: `Exported ${note.title}`, status: 'OK' });
        }
      } catch (error) {
        summary.notesError += 1;
        summary.status = 'ERROR';
        this.emit('log', { timestamp: new Date().toISOString(), message: `${note.title}: ${error.message}`, status: 'ERROR' });
      }

      this.emit('progress', {
        percent: notes.length === 0 ? 100 : Math.round(((index + 1) / notes.length) * 100),
        current: index + 1,
        total: notes.length,
        notesExported: summary.notesExported,
        attachmentsCopied: summary.attachmentCount,
        bytesWritten: summary.totalBytes,
        currentFile: note.title,
      });
    }

    if (checksums.length > 0 && config.sha256 !== false) {
      fs.writeFileSync(path.join(config.destinationDir, 'checksums.sha256'), `${checksums.join('\n')}\n`, 'utf-8');
    }

    if (this._history) this._history.add(summary);
    this.emit('complete', { summary });
    this._cancelled = false;
    return summary;
  }

  estimate(config) {
    const notes = this._collectNotes(config);
    const summary = {
      source: config.source,
      account: config.account || '',
      format: config.format || 'markdown',
      noteCount: notes.length,
      attachmentCount: 0,
      contentBytes: 0,
      attachmentBytes: 0,
      totalBytes: 0,
      includeAttachments: config.includeAttachments !== false,
    };

    for (const note of notes) {
      const content = this._renderNote(note, config);
      summary.contentBytes += Buffer.byteLength(content);

      if (config.includeAttachments !== false) {
        for (const resource of note.resources || []) {
          const size = this._resourceSize(resource);
          if (size === null) continue;
          summary.attachmentCount += 1;
          summary.attachmentBytes += size;
        }
      }
    }

    summary.totalBytes = summary.contentBytes + summary.attachmentBytes;
    return summary;
  }

  _collectNotes(config) {
    return this._filterNotes(sourceRegistry.collectSourceNotes(config), config);
  }

  _filterNotes(notes, config) {
    const notebookPath = normalizeNotebookPath(config.notebookPath || '');
    const after = config.modifiedAfter ? new Date(`${config.modifiedAfter}T00:00:00`).getTime() : null;
    const before = config.modifiedBefore ? new Date(`${config.modifiedBefore}T23:59:59.999`).getTime() : null;
    return notes.filter((note) => {
      if (notebookPath) {
        const notePath = normalizeNotebookPath(note.notebook || '');
        if (notePath !== notebookPath && !notePath.startsWith(`${notebookPath}/`)) return false;
      }
      const modified = normalizeTimestampMs(note.modified || 0);
      if (after !== null && modified < after) return false;
      if (before !== null && modified > before) return false;
      return true;
    });
  }

  _outputPath(note, config) {
    const extension = EXTENSIONS[config.format] || '.md';
    const parts = [config.destinationDir];
    if (config.rebuildHierarchy && note.notebook) {
      parts.push(...String(note.notebook).split(/[\\/]/).filter(Boolean).map(safeName));
    }
    ensureDir(path.join(...parts));
    return path.join(...parts, `${safeName(note.title)}${extension}`);
  }

  _renderNote(note, config) {
    if (config.format === 'json') return `${JSON.stringify(toJson(note, config), null, 2)}\n`;
    if (config.format === 'html') return toHtml(note, config);
    return toMarkdown(note, config);
  }

  _exportNote(note, config) {
    const outputPath = this._outputPath(note, config);
    if (config.incremental && fs.existsSync(outputPath)) {
      const outputMtimeSeconds = Math.floor(fs.statSync(outputPath).mtimeMs / 1000);
      if (noteModifiedSeconds(note) <= outputMtimeSeconds) return { skipped: true };
    }

    const files = [];
    const content = this._renderNote(note, config);
    fs.writeFileSync(outputPath, content, 'utf-8');
    files.push(outputPath);
    let bytesWritten = Buffer.byteLength(content);
    let attachmentCount = 0;

    if (config.includeAttachments !== false) {
      const assetDir = path.join(path.dirname(outputPath), 'assets');
      ensureDir(assetDir);
      for (const resource of note.resources || []) {
        const fileName = this._assetFileName(note, resource);
        const destPath = path.join(assetDir, fileName);
        if (resource.data) fs.writeFileSync(destPath, resource.data);
        else if (resource.localPath && fs.existsSync(resource.localPath)) fs.copyFileSync(resource.localPath, destPath);
        else continue;
        files.push(destPath);
        bytesWritten += fs.statSync(destPath).size;
        attachmentCount += 1;
      }
    }

    return { skipped: false, files, bytesWritten, attachmentCount };
  }

  _assetFileName(note, resource) {
    const imageBlock = (note.blocks || []).find((block) => block.type === 'image' && block.resourceId === resource.resourceId);
    if (imageBlock?.url) return safeName(path.basename(imageBlock.url));
    if (resource.fileName) return safeName(resource.fileName);
    if (resource.resourceId) {
      const ext = path.extname(resource.localPath || '') || resource.extension || extensionFromMime(resource.mimeType) || '.png';
      return safeName(`${resource.resourceId}${ext}`);
    }
    return safeName(path.basename(resource.localPath || 'asset'));
  }

  _resourceSize(resource) {
    if (resource.data) return Buffer.isBuffer(resource.data) ? resource.data.length : Buffer.byteLength(String(resource.data));
    if (resource.localPath && fs.existsSync(resource.localPath)) return fs.statSync(resource.localPath).size;
    return null;
  }
}

function extensionFromMime(mimeType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };
  return map[mimeType] || '';
}

function normalizeNotebookPath(value) {
  return String(value || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .join('/');
}

module.exports = Exporter;
