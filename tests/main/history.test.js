'use strict';

const fs = require('fs');
const path = require('path');
const History = require('../../src/main/history');

function makeTmpDir(name) {
  const root = path.join(__dirname, '../../..', 'tmp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

describe('History', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('nu-history');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('list() returns empty array when no file exists', () => {
    const history = new History(tmpDir);

    expect(history.list()).toEqual([]);
  });

  test('add() creates a record with id and timestamp', () => {
    const history = new History(tmpDir);
    const record = history.add({
      source: 'youdao',
      account: 'user@example.com',
      format: 'markdown',
      noteCount: 100,
      attachmentCount: 20,
      totalBytes: 1024 * 1024,
      destPath: 'C:/export',
      status: 'COMPLETED',
      config: {},
    });

    expect(record.id).toBeTruthy();
    expect(record.timestamp).toBeGreaterThan(0);
    expect(record.source).toBe('youdao');
  });

  test('list() returns records newest first', () => {
    const history = new History(tmpDir);

    history.add({ source: 'youdao', noteCount: 1 });
    history.add({ source: 'evernote', noteCount: 2 });

    const list = history.list();
    expect(list[0].source).toBe('evernote');
    expect(list[1].source).toBe('youdao');
  });

  test('clear() empties the history and persists', () => {
    const history = new History(tmpDir);

    history.add({ source: 'youdao' });
    history.clear();

    expect(history.list()).toEqual([]);
    expect(new History(tmpDir).list()).toEqual([]);
  });

  test('update() modifies an existing record', () => {
    const history = new History(tmpDir);
    const record = history.add({ source: 'youdao', status: 'RUNNING' });

    const updated = history.update(record.id, { status: 'COMPLETED', noteCount: 50 });

    expect(updated.status).toBe('COMPLETED');
    expect(updated.noteCount).toBe(50);
  });

  test('update() returns null for unknown id', () => {
    const history = new History(tmpDir);

    expect(history.update('nonexistent-id', { status: 'COMPLETED' })).toBeNull();
  });
});
