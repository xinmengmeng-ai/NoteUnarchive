'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { XMLValidator } = require('fast-xml-parser');
const { parseEvernoteNote } = require('../converter/parser');

function detect() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return [];

  const dataDir = path.join(localAppData, 'Evernote', 'Evernote', 'Databases');
  if (!fs.existsSync(dataDir)) return [];

  const enexFiles = fs
    .readdirSync(dataDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.enex'))
    .sort()
    .map((fileName) => path.join(dataDir, fileName));

  return [{ account: 'Evernote', dataDir, enexFiles }];
}

function firstMatch(raw, pattern) {
  const match = pattern.exec(raw);
  return match ? match[1].trim() : '';
}

function stripCdata(raw) {
  const trimmed = String(raw || '').trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(trimmed);
  return cdata ? cdata[1] : trimmed;
}

function parseEvernoteTimestamp(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || '');
  if (!match) return 0;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
}

function parseResources(noteXml) {
  const resources = [];
  const resourcePattern = /<resource\b[^>]*>([\s\S]*?)<\/resource>/gi;
  let match;

  while ((match = resourcePattern.exec(noteXml))) {
    const resourceXml = match[1];
    const dataText = firstMatch(resourceXml, /<data\b[^>]*>([\s\S]*?)<\/data>/i).replace(/\s+/g, '');
    const data = Buffer.from(dataText, 'base64');
    const mimeType = firstMatch(resourceXml, /<mime\b[^>]*>([\s\S]*?)<\/mime>/i);
    const fileName = firstMatch(resourceXml, /<file-name\b[^>]*>([\s\S]*?)<\/file-name>/i);
    const resourceId = crypto.createHash('md5').update(data).digest('hex');

    resources.push({
      resourceId,
      localPath: null,
      data,
      mimeType,
      fileName,
    });
  }

  return resources;
}

function parseEnex(enexPath) {
  const raw = fs.readFileSync(enexPath, 'utf-8');
  const validation = XMLValidator.validate(raw);
  if (validation !== true) {
    throw new Error(`Invalid ENEX: ${enexPath}`);
  }

  const notePattern = /<note\b[^>]*>([\s\S]*?)<\/note>/gi;
  const notes = [];
  let match;

  while ((match = notePattern.exec(raw))) {
    const noteXml = match[1];
    const content = stripCdata(firstMatch(noteXml, /<content\b[^>]*>([\s\S]*?)<\/content>/i));
    notes.push({
      id: `${path.basename(enexPath)}:${notes.length}`,
      title: firstMatch(noteXml, /<title\b[^>]*>([\s\S]*?)<\/title>/i) || 'Untitled',
      created: parseEvernoteTimestamp(firstMatch(noteXml, /<created\b[^>]*>([\s\S]*?)<\/created>/i)),
      modified: parseEvernoteTimestamp(firstMatch(noteXml, /<updated\b[^>]*>([\s\S]*?)<\/updated>/i)),
      notebook: '',
      tags: [],
      content,
      resources: parseResources(noteXml),
    });
  }

  if (notes.length === 0 && /<note\b/i.test(raw)) {
    throw new Error(`Invalid ENEX: ${enexPath}`);
  }

  return notes;
}

function loadNotes(dataDir) {
  const enexFiles = fs
    .readdirSync(dataDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.enex'))
    .sort()
    .map((fileName) => path.join(dataDir, fileName));

  return enexFiles.flatMap((enexPath) => parseEnex(enexPath));
}

function collectNotes(config) {
  const rawNotes = config.enexFiles ? config.enexFiles.flatMap((enexPath) => parseEnex(enexPath)) : loadNotes(config.dataDir);
  return rawNotes.map((note) => parseEvernoteNote(note));
}

const adapter = {
  id: 'evernote',
  name: 'Evernote',
  detect,
  listTree: () => [],
  collectNotes,
};

module.exports = {
  adapter,
  collectNotes,
  detect,
  loadNotes,
  parseEnex,
};
