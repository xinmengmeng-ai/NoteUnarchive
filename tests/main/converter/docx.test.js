'use strict';

const JSZip = require('jszip');
const { toDocxBuffer } = require('../../../src/main/converter/docx');

function makePng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aFoAAAAASUVORK5CYII=',
    'base64'
  );
}

async function loadDocxEntries(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = {};
  await Promise.all(
    Object.keys(zip.files).map(async (name) => {
      const file = zip.files[name];
      if (!file.dir) entries[name] = await file.async('string');
    })
  );
  return { zip, entries };
}

describe('toDocxBuffer', () => {
  test('renders rich-text blocks, inline styles, tables, and embedded images', async () => {
    const buffer = await toDocxBuffer({
      title: 'Rich Note',
      blocks: [
        { type: 'heading', level: 2, text: 'Heading' },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Bold', marks: ['bold'] },
            { type: 'text', text: ' and ' },
            { type: 'link', text: 'site', href: 'https://example.com', marks: ['italic'] },
          ],
        },
        { type: 'todo', checked: true, children: [{ type: 'text', text: 'done' }] },
        { type: 'blockquote', children: [{ type: 'text', text: 'quote' }] },
        {
          type: 'table',
          rows: [
            [[{ type: 'text', text: 'A' }], [{ type: 'text', text: 'B' }]],
            [[{ type: 'text', text: '1' }], [{ type: 'text', text: '2' }]],
          ],
        },
        { type: 'image', resourceId: 'img1', url: 'assets/img1.png' },
      ],
      resources: [{ resourceId: 'img1', data: makePng(), mimeType: 'image/png' }],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    const { zip, entries } = await loadDocxEntries(buffer);
    expect(entries['word/document.xml']).toContain('Heading');
    expect(entries['word/document.xml']).toContain('Bold');
    expect(entries['word/document.xml']).toContain('quote');
    expect(entries['word/document.xml']).toContain('[x] ');
    expect(entries['word/document.xml']).toContain('done');
    expect(entries['word/document.xml']).toContain('<w:tbl>');
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  test('renders markdown blocks into structured Word content', async () => {
    const buffer = await toDocxBuffer({
      title: 'Markdown Note',
      blocks: [
        {
          type: 'markdown',
          text: '# Title\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![image](assets/img1.png)',
        },
      ],
      resources: [{ resourceId: 'img1', data: makePng(), mimeType: 'image/png', assetFileName: 'img1.png' }],
    });

    const { zip, entries } = await loadDocxEntries(buffer);
    expect(entries['word/document.xml']).toContain('Title');
    expect(entries['word/document.xml']).toContain('one');
    expect(entries['word/document.xml']).toContain('<w:tbl>');
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  test('turns bare markdown URLs into Word hyperlinks', async () => {
    const buffer = await toDocxBuffer({
      title: 'Markdown Link',
      blocks: [{ type: 'markdown', text: 'Open https://example.com/docs for details.' }],
      resources: [],
    });

    const { entries } = await loadDocxEntries(buffer);
    expect(entries['word/document.xml']).toContain('https://example.com/docs');
    expect(entries['word/_rels/document.xml.rels']).toContain('Target="https://example.com/docs"');
  });

  test('turns bare rich-text URLs into Word hyperlinks', async () => {
    const buffer = await toDocxBuffer({
      title: 'Rich Link',
      blocks: [{ type: 'paragraph', text: 'Open https://example.com/runbook for details.' }],
      resources: [],
    });

    const { entries } = await loadDocxEntries(buffer);
    expect(entries['word/document.xml']).toContain('https://example.com/runbook');
    expect(entries['word/_rels/document.xml.rels']).toContain('Target="https://example.com/runbook"');
  });

  test('resolves markdown images by resourceId when source files have no extension metadata', async () => {
    const buffer = await toDocxBuffer({
      title: 'Markdown Image',
      blocks: [{ type: 'markdown', text: '![image](assets/WEBRESOURCE123.png)' }],
      resources: [{ resourceId: 'WEBRESOURCE123', localPath: 'C:/tmp/WEBRESOURCE123', data: makePng(), mimeType: '' }],
    });

    const { zip } = await loadDocxEntries(buffer);
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  test('detects embeddable images from binary signatures when metadata is missing', async () => {
    const buffer = await toDocxBuffer({
      title: 'Signature Image',
      blocks: [{ type: 'image', resourceId: 'WEBRESOURCE123', url: 'https://note.youdao.com/yws/res/1/WEBRESOURCE123' }],
      resources: [{ resourceId: 'WEBRESOURCE123', localPath: 'C:/tmp/WEBRESOURCE123', data: makePng(), mimeType: '' }],
    });

    const { zip } = await loadDocxEntries(buffer);
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  test('uses image placeholders when attachments are excluded', async () => {
    const buffer = await toDocxBuffer(
      {
        title: 'No Attachments',
        blocks: [{ type: 'image', resourceId: 'img1', url: 'assets/img1.png' }],
        resources: [{ resourceId: 'img1', data: makePng(), mimeType: 'image/png' }],
      },
      { includeAttachments: false }
    );

    const { zip, entries } = await loadDocxEntries(buffer);
    expect(entries['word/document.xml']).toContain('[image: img1.png]');
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(false);
  });
});
