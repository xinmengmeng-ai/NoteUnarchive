'use strict';

const { toHtml } = require('../../../src/main/converter/html');
const { toJson } = require('../../../src/main/converter/json');
const { toMarkdown } = require('../../../src/main/converter/markdown');

const ast = {
  id: 'n1',
  title: 'Title <One>',
  created: 1000,
  modified: 2000,
  notebook: 'Inbox',
  tags: ['tag-a'],
  blocks: [
    { type: 'heading', level: 2, text: 'Heading' },
    { type: 'paragraph', text: 'Body text' },
    { type: 'image', resourceId: 'img1', url: 'assets/img1.png' },
    { type: 'code', language: 'js', text: 'const x = 1;' },
    { type: 'list', ordered: false, items: ['A', 'B'] },
  ],
  resources: [{ resourceId: 'img1', localPath: 'C:/img1.png', mimeType: 'image/png' }],
};

describe('toMarkdown', () => {
  test('serializes common AST blocks', () => {
    expect(toMarkdown(ast)).toContain('## Heading');
    expect(toMarkdown(ast)).toContain('Body text');
    expect(toMarkdown(ast)).toContain('![](assets/img1.png)');
    expect(toMarkdown(ast)).toContain('```js\nconst x = 1;\n```');
    expect(toMarkdown(ast)).toContain('- A\n- B');
  });

  test('replaces images with placeholders when attachments are excluded', () => {
    expect(toMarkdown(ast, { includeAttachments: false })).toContain('[image: img1.png]');
  });
});

describe('toJson', () => {
  test('returns the public JSON export shape', () => {
    expect(toJson(ast)).toEqual({
      id: 'n1',
      title: 'Title <One>',
      created: 1000,
      modified: 2000,
      notebook: 'Inbox',
      tags: ['tag-a'],
      content: expect.stringContaining('## Heading'),
      attachments: [{ filename: 'assets/img1.png', mimeType: 'image/png' }],
    });
  });

  test('omits attachments when attachments are excluded', () => {
    const json = toJson(ast, { includeAttachments: false });

    expect(json.attachments).toEqual([]);
    expect(json.content).toContain('[image: img1.png]');
  });
});

describe('toHtml', () => {
  test('serializes HTML with inline CSS and escaped text', () => {
    const html = toHtml(ast);

    expect(html).toContain('<style>');
    expect(html).toContain('<title>Title &lt;One&gt;</title>');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<img src="assets/img1.png" alt="">');
    expect(html).toContain('<code>const x = 1;</code>');
  });

  test('uses image placeholders when attachments are excluded', () => {
    expect(toHtml(ast, { includeAttachments: false })).toContain('[image: img1.png]');
  });
});
