'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parseYoudaoNote } = require('../converter/parser');

const MAGIC_EXT = [
  { magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]), extension: '.png' },
  { magic: Buffer.from([0xff, 0xd8, 0xff]), extension: '.jpg' },
  { magic: Buffer.from('GIF8'), extension: '.gif' },
  { magic: Buffer.from('RIFF'), extension: '.webp' },
  { magic: Buffer.from('<svg'), extension: '.svg' },
];
function guessResourceExtension(filePath) {
  const ext = path.extname(filePath);
  if (ext) return ext;
  try {
    const head = fs.readFileSync(filePath).subarray(0, 8);
    for (const candidate of MAGIC_EXT) {
      if (head.subarray(0, candidate.magic.length).equals(candidate.magic)) return candidate.extension;
    }
  } catch {
    // Keep the Python prototype's conservative image default for extensionless resources.
  }
  return '.png';
}

function detect() {
  const appdata = process.env.APPDATA;
  if (!appdata) return [];

  const ynoteRoot = path.join(appdata, 'ynote-desktop');
  if (!fs.existsSync(ynoteRoot)) return [];

  const results = [];
  const entries = fs.readdirSync(ynoteRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.includes('@')) continue;

    const dataDir = path.join(ynoteRoot, entry.name, 'ynote-data');
    if (!fs.existsSync(dataDir)) continue;

    const dbFiles = fs.readdirSync(dataDir).filter((fileName) => {
      return (
        fileName.endsWith('.db') &&
        fileName.includes('@') &&
        !fileName.includes('content') &&
        !fileName.includes('search')
      );
    });

    if (dbFiles.length === 0) continue;

    const dbPath = path.join(dataDir, dbFiles[0]);
    const contentDbPath = resolveContentDbPath({ account: entry.name, dataDir, dbPath });
    results.push({
      account: entry.name,
      dataDir,
      dbPath,
      ...(contentDbPath ? { contentDbPath } : {}),
      fileDir: path.join(dataDir, 'file'),
    });
  }

  return results;
}

function loadNoteTree(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const nodes = new Map();

  try {
    const notebooks = db.prepare('SELECT fileId, title, parentId FROM note_book WHERE del=0').all();
    for (const row of notebooks) {
      nodes.set(row.fileId, {
        title: row.title || 'Untitled',
        isDir: true,
        parent: row.parentId,
        children: [],
      });
    }

    const notes = db
      .prepare('SELECT fileId, title, parentId, contentSynced, resources, modifyTime FROM note WHERE del=0')
      .all();
    for (const row of notes) {
      nodes.set(row.fileId, {
        title: row.title || 'Untitled',
        isDir: false,
        parent: row.parentId,
        synced: Boolean(row.contentSynced),
        resources: row.resources || '[]',
        modifyTime: row.modifyTime || 0,
        children: [],
      });
    }
  } finally {
    db.close();
  }

  const roots = [];
  for (const [fileId, node] of nodes) {
    if (node.parent && nodes.has(node.parent)) {
      nodes.get(node.parent).children.push(fileId);
    } else {
      roots.push(fileId);
    }
  }

  return { nodes, roots };
}

function noteFileExists(fileDir, fileId) {
  if (!fileId) return false;
  if (!fileDir) return true;
  const lastChar = fileId[fileId.length - 1].toLowerCase();
  return fs.existsSync(path.join(fileDir, lastChar, fileId));
}

function noteHasExportableContent(fileDir, fileId, contentIndex) {
  if (noteFileExists(fileDir, fileId)) return true;
  if (contentIndex?.get(fileId)?.content) return true;
  return false;
}

function resolveContentDbPath(config = {}) {
  if (config.contentDbPath && fs.existsSync(config.contentDbPath)) return config.contentDbPath;
  const dataDir = config.dataDir || (config.dbPath ? path.dirname(config.dbPath) : '');
  if (!dataDir || !fs.existsSync(dataDir)) return '';

  const candidates = [];
  if (config.account) candidates.push(path.join(dataDir, `${config.account}-content.db`));
  if (config.dbPath) candidates.push(path.join(dataDir, `${path.basename(config.dbPath, '.db')}-content.db`));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const discovered = fs.readdirSync(dataDir).find((fileName) => fileName.endsWith('-content.db'));
  return discovered ? path.join(dataDir, discovered) : '';
}

function loadContentIndex(contentDbPath) {
  const index = new Map();
  if (!contentDbPath || !fs.existsSync(contentDbPath)) return index;

  let db;
  try {
    db = new Database(contentDbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT fileId, content, title, erased FROM contenttable').all();
    for (const row of rows) {
      if (!row.fileId || String(row.erased || '0') !== '0') continue;
      const content = String(row.content || '').trim();
      if (!content) continue;
      index.set(row.fileId, {
        content,
        title: row.title || '',
      });
    }
  } catch {
    return index;
  } finally {
    if (db) db.close();
  }

  return index;
}

function listNotebookTree(dbPath, fileDir, contentDbPath) {
  const { nodes, roots } = loadNoteTree(dbPath);
  const contentIndex = loadContentIndex(contentDbPath || resolveContentDbPath({ dbPath }));

  function noteCountFor(folderId) {
    const node = nodes.get(folderId);
    if (!node) return 0;
    let count = 0;
    for (const childId of node.children || []) {
      const child = nodes.get(childId);
      if (!child) continue;
      count += child.isDir ? noteCountFor(childId) : noteHasExportableContent(fileDir, childId, contentIndex) ? 1 : 0;
    }
    return count;
  }

  function buildFolder(folderId, parentPath = '') {
    const node = nodes.get(folderId);
    const folderPath = parentPath ? `${parentPath}/${node.title}` : node.title;
    return {
      id: folderId,
      title: node.title,
      path: folderPath,
      noteCount: noteCountFor(folderId),
      children: (node.children || [])
        .filter((childId) => nodes.get(childId)?.isDir)
        .map((childId) => buildFolder(childId, folderPath))
        .filter((child) => child.noteCount > 0),
    };
  }

  return roots
    .filter((rootId) => nodes.get(rootId)?.isDir)
    .map((rootId) => buildFolder(rootId))
    .filter((folder) => folder.noteCount > 0);
}

function loadResourceIndex(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const index = new Map();
  const dataDir = path.dirname(dbPath);

  try {
    let rows = [];
    try {
      rows = db.prepare('SELECT resourceID, entry FROM resource').all();
    } catch {
      return index;
    }
    for (const row of rows) {
      if (row.entry && fs.existsSync(row.entry)) {
        index.set(row.resourceID, row.entry);
        continue;
      }

      const fallbackPath = path.join(dataDir, 'resource', row.resourceID[row.resourceID.length - 1].toLowerCase(), row.resourceID);
      if (fs.existsSync(fallbackPath)) index.set(row.resourceID, fallbackPath);
    }
  } finally {
    db.close();
  }

  return index;
}

function readNoteFile(fileDir, fileId) {
  if (!fileDir || !fileId) return null;
  const lastChar = fileId[fileId.length - 1].toLowerCase();
  const filePath = path.join(fileDir, lastChar, fileId);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

function notebookPath(nodes, parentId) {
  const parts = [];
  let current = parentId;
  while (current && nodes.has(current)) {
    const node = nodes.get(current);
    parts.unshift(node.title);
    current = node.parent;
  }
  return parts.join(path.sep);
}

function collectNotes(config) {
  const tree = loadNoteTree(config.dbPath);
  const resourceIndex = loadResourceIndex(config.dbPath);
  const contentIndex = loadContentIndex(resolveContentDbPath(config));
  const notes = [];
  for (const [fileId, node] of tree.nodes.entries()) {
    if (node.isDir) continue;
    const raw = readNoteFile(config.fileDir, fileId);
    const fallback = raw ? null : contentIndex.get(fileId);
    const content = raw || fallback?.content;
    if (!content) continue;
    notes.push(
      parseYoudaoNote(
        {
          fileId,
          title: node.title,
          modified: node.modifyTime,
          modifyTime: node.modifyTime,
          notebook: notebookPath(tree.nodes, node.parent),
          rawResources: node.resources,
        },
        content,
        resourceIndex
      )
    );
  }
  return notes;
}

const adapter = {
  id: 'youdao',
  name: 'YoudaoNote',
  detect,
  listTree: (source) => (source?.dbPath ? listNotebookTree(source.dbPath, source.fileDir, resolveContentDbPath(source)) : []),
  collectNotes,
};

module.exports = {
  adapter,
  collectNotes,
  detect,
  loadNoteTree,
  listNotebookTree,
  loadContentIndex,
  loadResourceIndex,
  readNoteFile,
  resolveContentDbPath,
  guessResourceExtension,
};
