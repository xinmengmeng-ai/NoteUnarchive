'use strict';

const fs = require('fs');
const path = require('path');
const Exporter = require('../../src/main/exporter');
const History = require('../../src/main/history');
const sourceRegistry = require('../../src/main/sources');
const JSZip = require('jszip');

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

  test('estimates export bytes from rendered notes and real attachment files', async () => {
    const assetPath = path.join(tmpDir, 'source-asset.txt');
    fs.writeFileSync(assetPath, 'asset-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const estimate = await exporter.estimate({
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

  test('estimate respects disabled attachments', async () => {
    const assetPath = path.join(tmpDir, 'source-image.png');
    fs.writeFileSync(assetPath, 'image-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const estimate = await exporter.estimate({
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

  test('exports docx notes as binary files with embedded images and external non-image attachments', async () => {
    const imagePath = path.join(tmpDir, 'source-image.png');
    const pdfPath = path.join(tmpDir, 'source-file.pdf');
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aFoAAAAASUVORK5CYII=',
        'base64'
      )
    );
    fs.writeFileSync(pdfPath, 'pdf-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'docx',
      destinationDir: path.join(tmpDir, 'out-docx'),
      rebuildHierarchy: true,
      includeAttachments: true,
      sha256: true,
      notes: [
        makeAst({
          title: 'Docx Note',
          blocks: [
            { type: 'heading', level: 1, text: 'Hello' },
            { type: 'image', resourceId: 'img1', url: 'assets/img1.png' },
          ],
          resources: [
            { resourceId: 'img1', localPath: imagePath, mimeType: 'image/png' },
            { resourceId: 'file1', localPath: pdfPath, mimeType: 'application/pdf', fileName: 'guide.pdf' },
          ],
        }),
      ],
    });

    const notePath = path.join(tmpDir, 'out-docx', 'Inbox', 'Docx Note.docx');
    const zip = await JSZip.loadAsync(fs.readFileSync(notePath));

    expect(summary.notesExported).toBe(1);
    expect(fs.existsSync(notePath)).toBe(true);
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
    expect(fs.existsSync(path.join(path.dirname(notePath), 'assets', 'guide.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(path.dirname(notePath), 'assets', 'img1.png'))).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, 'out-docx', 'checksums.sha256'), 'utf-8')).toContain('Inbox/Docx Note.docx');
  });

  test('copies unreferenced image attachments beside docx notes instead of dropping them', async () => {
    const attachedImagePath = path.join(tmpDir, 'attached-image.png');
    fs.writeFileSync(attachedImagePath, 'attached-image-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'docx',
      destinationDir: path.join(tmpDir, 'out-docx-unreferenced-image'),
      rebuildHierarchy: true,
      includeAttachments: true,
      notes: [
        makeAst({
          title: 'Docx With Attachment',
          blocks: [{ type: 'paragraph', text: 'Body without image references' }],
          resources: [
            {
              resourceId: 'attached-image',
              localPath: attachedImagePath,
              mimeType: 'image/png',
              fileName: 'attached-image.png',
            },
          ],
        }),
      ],
    });

    const notePath = path.join(tmpDir, 'out-docx-unreferenced-image', 'Inbox', 'Docx With Attachment.docx');
    const copiedImagePath = path.join(path.dirname(notePath), 'assets', 'attached-image.png');
    expect(fs.readFileSync(copiedImagePath, 'utf-8')).toBe('attached-image-data');
  });

  test('keeps duplicate note titles by assigning unique output file names', async () => {
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'docx',
      destinationDir: path.join(tmpDir, 'out-duplicates'),
      rebuildHierarchy: true,
      notes: [
        makeAst({ id: 'dup1', title: 'Duplicate', notebook: 'Inbox', blocks: [{ type: 'paragraph', text: 'First' }] }),
        makeAst({ id: 'dup2', title: 'Duplicate', notebook: 'Inbox', blocks: [{ type: 'paragraph', text: 'Second' }] }),
      ],
    });

    expect(summary.notesExported).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, 'out-duplicates', 'Inbox', 'Duplicate.docx'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out-duplicates', 'Inbox', 'Duplicate (2).docx'))).toBe(true);
  });

  test('does not copy markdown image resources with missing mime metadata beside docx notes', async () => {
    const imagePath = path.join(tmpDir, 'WEBRESOURCE123');
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aFoAAAAASUVORK5CYII=',
        'base64'
      )
    );
    const exporter = new Exporter({ history: new History(tmpDir) });

    await exporter.start({
      source: 'test',
      format: 'docx',
      destinationDir: path.join(tmpDir, 'out-docx-markdown-image'),
      rebuildHierarchy: false,
      includeAttachments: true,
      notes: [
        makeAst({
          title: 'Markdown Docx',
          blocks: [{ type: 'markdown', text: '![image](assets/WEBRESOURCE123.png)' }],
          resources: [{ resourceId: 'WEBRESOURCE123', localPath: imagePath, mimeType: '' }],
        }),
      ],
    });

    const noteDir = path.join(tmpDir, 'out-docx-markdown-image');
    expect(fs.existsSync(path.join(noteDir, 'assets', 'WEBRESOURCE123.png'))).toBe(false);
    expect(fs.existsSync(path.join(noteDir, 'assets'))).toBe(false);
  });

  test('estimates docx bytes from binary content plus external attachments', async () => {
    const pdfPath = path.join(tmpDir, 'source-file.pdf');
    fs.writeFileSync(pdfPath, 'pdf-data');
    const exporter = new Exporter({ history: new History(tmpDir) });

    const estimate = await exporter.estimate({
      source: 'test',
      format: 'docx',
      destinationDir: path.join(tmpDir, 'out-docx-estimate'),
      includeAttachments: true,
      notes: [
        makeAst({
          blocks: [{ type: 'paragraph', text: 'Body' }],
          resources: [{ resourceId: 'file1', localPath: pdfPath, mimeType: 'application/pdf', fileName: 'guide.pdf' }],
        }),
      ],
    });

    expect(estimate.contentBytes).toBeGreaterThan(0);
    expect(estimate.attachmentCount).toBe(1);
    expect(estimate.attachmentBytes).toBe(Buffer.byteLength('pdf-data'));
    expect(estimate.totalBytes).toBeGreaterThan(estimate.attachmentBytes);
  });

  test('estimates docx bytes without rendering full docx packages for every note', async () => {
    const imagePath = path.join(tmpDir, 'source-image.png');
    fs.writeFileSync(imagePath, Buffer.alloc(4096, 1));
    const exporter = new Exporter({ history: new History(tmpDir) });
    const renderSpy = jest.spyOn(exporter, '_renderNote');

    const estimate = await exporter.estimate({
      source: 'test',
      format: 'docx',
      destinationDir: path.join(tmpDir, 'out-docx-fast-estimate'),
      includeAttachments: true,
      notes: [
        makeAst({
          title: 'Fast Estimate',
          blocks: [
            { type: 'heading', level: 1, text: 'Heading' },
            { type: 'paragraph', text: 'Body with https://example.com' },
            { type: 'image', resourceId: 'img1', url: 'assets/img1.png' },
          ],
          resources: [{ resourceId: 'img1', localPath: imagePath, mimeType: 'image/png' }],
        }),
      ],
    });

    expect(renderSpy).not.toHaveBeenCalled();
    expect(estimate.attachmentCount).toBe(0);
    expect(estimate.contentBytes).toBeGreaterThan(fs.statSync(imagePath).size);
    expect(estimate.totalBytes).toBe(estimate.contentBytes);
  });

  test('skips existing docx output when incremental export is enabled', async () => {
    const destinationDir = path.join(tmpDir, 'out-docx-incremental');
    const notePath = path.join(destinationDir, 'My Note.docx');
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.writeFileSync(notePath, 'existing-docx');
    const future = new Date('2030-01-01T00:00:00Z');
    fs.utimesSync(notePath, future, future);
    const exporter = new Exporter({ history: new History(tmpDir) });

    const summary = await exporter.start({
      source: 'test',
      format: 'docx',
      destinationDir,
      rebuildHierarchy: false,
      incremental: true,
      notes: [makeAst()],
    });

    expect(summary.notesSkipped).toBe(1);
    expect(summary.notesExported).toBe(0);
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
