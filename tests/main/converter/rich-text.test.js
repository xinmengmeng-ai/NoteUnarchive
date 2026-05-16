'use strict';

const { toMarkdown } = require('../../../src/main/converter/markdown');
const { parseEvernoteNote, parseYoudaoNote } = require('../../../src/main/converter/parser');

describe('rich text markdown export', () => {
  test('renders inline marks links todos quotes and tables', () => {
    const markdown = toMarkdown({
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Bold', marks: ['bold'] },
            { type: 'text', text: ' and ' },
            { type: 'link', text: 'site', href: 'https://example.com', marks: ['italic'] },
            { type: 'text', text: ' old', marks: ['strike'] },
            { type: 'text', text: ' under', marks: ['underline'] },
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
      ],
    });

    expect(markdown).toContain('**Bold** and *[site](https://example.com)* ~~old~~ <u>under</u>');
    expect(markdown).toContain('- [x] done');
    expect(markdown).toContain('> quote');
    expect(markdown).toContain('| A | B |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| 1 | 2 |');
  });

  test('keeps raw markdown blocks intact', () => {
    const markdown = toMarkdown({
      blocks: [{ type: 'markdown', text: '| A | B |\n| - | - |\n| 1 | 2 |' }],
    });

    expect(markdown).toBe('| A | B |\n| - | - |\n| 1 | 2 |');
  });
});

describe('rich text parsers', () => {
  test('parseEvernoteNote preserves common ENML rich text tags', () => {
    const ast = parseEvernoteNote({
      id: 'e1',
      title: 'ENML',
      content:
        '<en-note><div><strong>Bold</strong> <em>Italic</em> <a href="https://example.com">Link</a></div><blockquote>Quote</blockquote><ul><li>Item</li></ul><table><tr><td>A</td><td>B</td></tr></table></en-note>',
      resources: [],
    });
    const markdown = toMarkdown(ast);

    expect(markdown).toContain('**Bold** *Italic* [Link](https://example.com)');
    expect(markdown).toContain('> Quote');
    expect(markdown).toContain('- Item');
    expect(markdown).toContain('| A | B |');
  });

  test('parseYoudaoNote preserves markdown source as one markdown block after image localization', () => {
    const raw = '# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |';
    const ast = parseYoudaoNote({ fileId: 'n1', title: 'Markdown' }, Buffer.from(raw));

    expect(ast.blocks).toEqual([{ type: 'markdown', text: raw }]);
    expect(toMarkdown(ast)).toContain('| A | B |');
  });

  test('parseYoudaoNote converts generic JSON rich text blocks', () => {
    const ast = parseYoudaoNote(
      { fileId: 'n2', title: 'JSON' },
      JSON.stringify({
        blocks: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Bold', marks: ['bold'] }] },
          { type: 'todo', checked: false, text: 'Task' },
        ],
      })
    );

    expect(toMarkdown(ast)).toContain('**Bold**');
    expect(toMarkdown(ast)).toContain('- [ ] Task');
  });
});
