'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const youdao = require('../../../src/main/sources/youdao');

function makeTmpDir(name) {
  const root = path.join(__dirname, '../../../..', 'tmp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

describe('YoudaoNote source', () => {
  let tmpDir;
  let oldAppdata;

  beforeEach(() => {
    tmpDir = makeTmpDir('nu-youdao');
    oldAppdata = process.env.APPDATA;
  });

  afterEach(() => {
    if (oldAppdata === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = oldAppdata;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detect() returns empty array when APPDATA is not set', () => {
    delete process.env.APPDATA;

    expect(youdao.detect()).toEqual([]);
  });

  test('detect() returns one entry per Youdao account with a main database', () => {
    process.env.APPDATA = tmpDir;
    const dataDir = path.join(tmpDir, 'ynote-desktop', 'user@example.com', 'ynote-data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'user@example.com.db'), '');
    fs.writeFileSync(path.join(dataDir, 'content.db'), '');

    expect(youdao.detect()).toEqual([
      {
        account: 'user@example.com',
        dataDir,
        dbPath: path.join(dataDir, 'user@example.com.db'),
        fileDir: path.join(dataDir, 'file'),
      },
    ]);
  });

  test('loadNoteTree() returns nodes and roots', () => {
    const dbPath = path.join(tmpDir, 'test@example.com.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE note_book (fileId TEXT, title TEXT, parentId TEXT, del INTEGER);
      CREATE TABLE note (
        fileId TEXT,
        title TEXT,
        parentId TEXT,
        contentSynced INTEGER,
        resources TEXT,
        modifyTime INTEGER,
        del INTEGER
      );
    `);
    db.prepare('INSERT INTO note_book VALUES (?, ?, ?, ?)').run('nb1', 'Notebook 1', null, 0);
    db.prepare('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)').run('n1', 'Note 1', 'nb1', 1, '[]', 1700000000000, 0);
    db.prepare('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)').run('n2', 'Note 2', 'nb1', 0, '[]', 1700000000000, 0);
    db.close();

    const { nodes, roots } = youdao.loadNoteTree(dbPath);

    expect(nodes.size).toBe(3);
    expect(roots).toEqual(['nb1']);
    expect(nodes.get('nb1').children).toEqual(['n1', 'n2']);
    expect(nodes.get('n1').synced).toBe(true);
    expect(nodes.get('n2').synced).toBe(false);
  });

  test('listNotebookTree() returns recursive folder note counts for export selection', () => {
    const dbPath = path.join(tmpDir, 'test@example.com.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE note_book (fileId TEXT, title TEXT, parentId TEXT, del INTEGER);
      CREATE TABLE note (
        fileId TEXT,
        title TEXT,
        parentId TEXT,
        contentSynced INTEGER,
        resources TEXT,
        modifyTime INTEGER,
        del INTEGER
      );
    `);
    db.prepare('INSERT INTO note_book VALUES (?, ?, ?, ?)').run('root', 'Root', null, 0);
    db.prepare('INSERT INTO note_book VALUES (?, ?, ?, ?)').run('child', 'Child', 'root', 0);
    db.prepare('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)').run('n1', 'Root Note', 'root', 1, '[]', 1700000000000, 0);
    db.prepare('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)').run('n2', 'Child Note', 'child', 1, '[]', 1700000000000, 0);
    db.close();

    expect(youdao.listNotebookTree(dbPath)).toEqual([
      {
        id: 'root',
        title: 'Root',
        path: 'Root',
        noteCount: 2,
        children: [{ id: 'child', title: 'Child', path: 'Root/Child', noteCount: 1, children: [] }],
      },
    ]);
  });

  test('listNotebookTree() counts only notes with local files when fileDir is provided', () => {
    const dbPath = path.join(tmpDir, 'test@example.com.db');
    const fileDir = path.join(tmpDir, 'file');
    fs.mkdirSync(path.join(fileDir, '1'), { recursive: true });
    fs.writeFileSync(path.join(fileDir, '1', 'n1'), 'body');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE note_book (fileId TEXT, title TEXT, parentId TEXT, del INTEGER);
      CREATE TABLE note (
        fileId TEXT,
        title TEXT,
        parentId TEXT,
        contentSynced INTEGER,
        resources TEXT,
        modifyTime INTEGER,
        del INTEGER
      );
    `);
    db.prepare('INSERT INTO note_book VALUES (?, ?, ?, ?)').run('root', 'Root', null, 0);
    db.prepare('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)').run('n1', 'Exportable', 'root', 1, '[]', 1700000000000, 0);
    db.prepare('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)').run('n2', 'Missing Local File', 'root', 1, '[]', 1700000000000, 0);
    db.close();

    expect(youdao.listNotebookTree(dbPath, fileDir)[0].noteCount).toBe(1);
  });

  test('loadResourceIndex() maps existing resources and skips missing files', () => {
    const dbPath = path.join(tmpDir, 'test@example.com.db');
    const resourcePath = path.join(tmpDir, 'res123.png');
    fs.writeFileSync(resourcePath, 'fake-image');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE resource (resourceID TEXT, entry TEXT)');
    db.prepare('INSERT INTO resource VALUES (?, ?)').run('res123', resourcePath);
    db.prepare('INSERT INTO resource VALUES (?, ?)').run('res456', path.join(tmpDir, 'missing.png'));
    db.close();

    const index = youdao.loadResourceIndex(dbPath);

    expect(index.size).toBe(1);
    expect(index.get('res123')).toBe(resourcePath);
    expect(index.has('res456')).toBe(false);
  });

  test('loadResourceIndex() falls back to resource/<lastChar>/<resourceId> when entry is empty', () => {
    const dataDir = path.join(tmpDir, 'ynote-data');
    const dbPath = path.join(dataDir, 'test@example.com.db');
    const resourceId = 'WEBRESOURCEabc123';
    const resourcePath = path.join(dataDir, 'resource', '3', resourceId);
    fs.mkdirSync(path.dirname(resourcePath), { recursive: true });
    fs.writeFileSync(resourcePath, 'fake-image');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE resource (resourceID TEXT, entry TEXT)');
    db.prepare('INSERT INTO resource VALUES (?, ?)').run(resourceId, null);
    db.close();

    const index = youdao.loadResourceIndex(dbPath);

    expect(index.get(resourceId)).toBe(resourcePath);
  });

  test('readNoteFile() reads file/<lastChar>/<fileId> content', () => {
    const fileDir = path.join(tmpDir, 'file');
    const fileId = 'abc123';
    const filePath = path.join(fileDir, '3', fileId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'note-body');

    expect(youdao.readNoteFile(fileDir, fileId).toString('utf-8')).toBe('note-body');
    expect(youdao.readNoteFile(fileDir, 'missing')).toBeNull();
  });
});
