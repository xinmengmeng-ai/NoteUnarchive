'use strict';

const fs = require('fs');
const path = require('path');
const Exporter = require('../../src/main/exporter');
const History = require('../../src/main/history');
const sourceRegistry = require('../../src/main/sources');

function makeTmpDir(name) {
  const root = path.join(__dirname, '../..', 'tmp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

function makeAst(overrides = {}) {
  return Object.assign(
    {
      id: 'n1',
      title: 'My Note',
      created: 1000,
      modified: 1700000000000,
      notebook: 'Inbox',
      tags: [],
      blocks: [
        { type: 'heading', level: 1, text: 'Hello' },
        { type: 'paragraph', text: 'Body' },
        { type: 'image', resourceId: 'res1', url: 'assets/res1.txt' },
      ],
      resources: [],
    },
    overrides
  );
}

describe('Exporter', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('nu-exporter');
  });

  afterEach(() => {
    sourceRegistry.unregisterSourceAdapter('fake');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exports markdown notes with attachments and checksum history', async () => {
    const assetPath = path.join(tmpDir, 'source-asset.txt');
    fs.writeFileSync(assetPath, 'asset-data');
    const history = new History(tmpDir);
    const exporter = new Exporter({ history });
    const logs = [];
    exporter.on('log', (entry) => logs.push(entry));

    const summary = await exporter.start({
      source: 'test',
      account: 'fixture',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out'),
      rebuildHierarchy: true,
      includeAttachments: true,
      sha256: true,
      notes: [makeAst({ resources: [{ resourceId: 'res1', localPath: assetPath, mimeType: 'text/plain' }] })],
    });

    expect(summary.status).toBe('COMPLETED');
    expect(summary.notesExported).toBe(1);
    const notePath = path.join(tmpDir, 'out', 'Inbox', 'My Note.md');
    const noteContent = fs.readFileSync(notePath, 'utf-8');
    expect(noteContent).toContain('# Hello');
    expect(noteContent).toContain('![](assets/res1.txt)');
    expect(fs.readFileSync(path.join(path.dirname(notePath), 'assets', 'res1.txt'), 'utf-8')).toBe('asset-data');
    expect(fs.readFileSync(path.join(tmpDir, 'out', 'checksums.sha256'), 'utf-8')).toContain('Inbox/My Note.md');
    expect(history.list()[0]).toMatchObject({ source: 'test', account: 'fixture', status: 'COMPLETED' });
    expect(logs.some((entry) => entry.status === 'OK')).toBe(true);
  });

  test('collects notes from a registered source adapter', async () => {
    sourceRegistry.registerSourceAdapter({
      id: 'fake',
      name: 'Fake Notes',
      detect: () => [],
      listTree: () => [],
      collectNotes: () => [makeAst({ title: 'Adapter Note', notebook: 'Imported' })],
    });
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'fake',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out-adapter'),
      rebuildHierarchy: true,
    });

    expect(summary.notesExported).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'out-adapter', 'Imported', 'Adapter Note.md'))).toBe(true);
  });

  test('estimates export bytes from rendered notes and real attachment files', () => {
    const assetPath = path.join(tmpDir, 'source-asset.txt');
    fs.writeFileSync(assetPath, 'asset-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const estimate = exporter.estimate({
      source: 'test',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out-estimate'),
      includeAttachments: true,
      notes: [makeAst({ resources: [{ resourceId: 'res1', localPath: assetPath, mimeType: 'text/plain' }] })],
    });

    expect(estimate.noteCount).toBe(1);
    expect(estimate.attachmentCount).toBe(1);
    expect(estimate.attachmentBytes).toBe(Buffer.byteLength('asset-data'));
    expect(estimate.totalBytes).toBeGreaterThan(estimate.attachmentBytes);
  });

  test('estimate respects disabled attachments', () => {
    const assetPath = path.join(tmpDir, 'source-image.png');
    fs.writeFileSync(assetPath, 'image-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const estimate = exporter.estimate({
      source: 'test',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out-no-assets'),
      includeAttachments: false,
      notes: [makeAst({ resources: [{ resourceId: 'res1', localPath: assetPath, mimeType: 'image/png' }] })],
    });

    expect(estimate.noteCount).toBe(1);
    expect(estimate.attachmentCount).toBe(0);
    expect(estimate.attachmentBytes).toBe(0);
  });

  test('filters exports by selected notebook path including nested folders', async () => {
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out-folder'),
      notebookPath: 'Root/Child',
      notes: [
        makeAst({ title: 'Keep Direct', notebook: 'Root/Child' }),
        makeAst({ title: 'Keep Nested', notebook: 'Root/Child/Deep' }),
        makeAst({ title: 'Skip Sibling', notebook: 'Root/Sibling' }),
      ],
    });

    expect(summary.noteCount).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, 'out-folder', 'Keep Direct.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out-folder', 'Keep Nested.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out-folder', 'Skip Sibling.md'))).toBe(false);
  });

  test('copies attachments beside nested notes so markdown relative image links resolve', async () => {
    const assetPath = path.join(tmpDir, 'source-image.png');
    fs.writeFileSync(assetPath, 'image-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    await exporter.start({
      source: 'test',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out-relative'),
      rebuildHierarchy: true,
      includeAttachments: true,
      notes: [
        makeAst({
          title: 'Nested Note',
          notebook: 'Deep/Folder',
          blocks: [{ type: 'image', resourceId: 'res1', url: 'assets/res1.png' }],
          resources: [{ resourceId: 'res1', localPath: assetPath, mimeType: 'image/png' }],
        }),
      ],
    });

    const notePath = path.join(tmpDir, 'out-relative', 'Deep', 'Folder', 'Nested Note.md');
    const linkedPath = path.join(path.dirname(notePath), 'assets', 'res1.png');

    expect(fs.readFileSync(notePath, 'utf-8')).toContain('![](assets/res1.png)');
    expect(fs.readFileSync(linkedPath, 'utf-8')).toBe('image-data');
    expect(fs.existsSync(path.join(tmpDir, 'out-relative', 'assets', 'res1.png'))).toBe(false);
  });

  test('skips existing output when incremental export is enabled', async () => {
    const destinationDir = path.join(tmpDir, 'out');
    const notePath = path.join(destinationDir, 'My Note.json');
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.writeFileSync(notePath, '{}');
    const future = new Date('2030-01-01T00:00:00Z');
    fs.utimesSync(notePath, future, future);
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'json',
      destinationDir,
      rebuildHierarchy: false,
      incremental: true,
      notes: [makeAst()],
    });

    expect(summary.notesSkipped).toBe(1);
    expect(summary.notesExported).toBe(0);
  });

  test('filters notes whose modified timestamp is stored in seconds', async () => {
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'markdown',
      destinationDir: path.join(tmpDir, 'out-seconds'),
      modifiedAfter: '2026-05-01',
      modifiedBefore: '2026-05-31',
      notes: [
        makeAst({ title: 'May Note', modified: 1778594924 }),
        makeAst({ title: 'Old Note', modified: 1700000000 }),
      ],
    });

    expect(summary.noteCount).toBe(1);
    expect(summary.notesExported).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'out-seconds', 'May Note.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out-seconds', 'Old Note.md'))).toBe(false);
  });

  test('cancel() records a cancelled history entry', async () => {
    const history = new History(tmpDir);
    const exporter = new Exporter({ history });
    exporter.cancel();

    const summary = await exporter.start({
      source: 'test',
      format: 'html',
      destinationDir: path.join(tmpDir, 'out'),
      notes: [makeAst()],
    });

    expect(summary.status).toBe('CANCELLED');
    expect(history.list()[0].status).toBe('CANCELLED');
  });
});
