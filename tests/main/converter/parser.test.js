'use strict';

const { parseEvernoteNote, parseYoudaoNote } = require('../../../src/main/converter/parser');

describe('note parser', () => {
  test('parseYoudaoNote() converts plain text into paragraph blocks', () => {
    const ast = parseYoudaoNote(
      { fileId: 'n1', title: 'Plain', modifyTime: 1700000000000, notebook: 'Inbox' },
      Buffer.from('First paragraph\n\nSecond paragraph', 'utf-8')
    );

    expect(ast).toMatchObject({
      id: 'n1',
      title: 'Plain',
      modified: 1700000000000,
      notebook: 'Inbox',
    });
    expect(ast.blocks).toEqual([
      { type: 'paragraph', text: 'First paragraph' },
      { type: 'paragraph', text: 'Second paragraph' },
    ]);
  });

  test('parseYoudaoNote() accepts JSON content blocks', () => {
    const ast = parseYoudaoNote(
      { fileId: 'n2', title: 'JSON' },
      JSON.stringify({
        blocks: [
          { type: 'heading', level: 2, text: 'Title' },
          { type: 'paragraph', text: 'Body' },
          { type: 'image', resourceId: 'res1' },
        ],
      }),
      new Map([['res1', 'C:/assets/res1.png']])
    );

    expect(ast.blocks).toEqual([
      { type: 'heading', level: 2, text: 'Title' },
      { type: 'paragraph', text: 'Body' },
      { type: 'image', resourceId: 'res1', url: 'assets/res1.png' },
    ]);
    expect(ast.resources).toEqual([{ resourceId: 'res1', localPath: 'C:/assets/res1.png', mimeType: '' }]);
  });

  test('parseYoudaoNote() extracts text and images from XML content', () => {
    const ast = parseYoudaoNote(
      { fileId: 'n3', title: 'XML' },
      '<note><body><p>Hello XML</p><img src="resource://img123" /></body></note>',
      new Map([['img123', 'C:/assets/img123.jpg']])
    );

    expect(ast.blocks).toEqual([
      { type: 'paragraph', text: 'Hello XML' },
      { type: 'image', resourceId: 'img123', url: 'assets/img123.jpg' },
    ]);
  });

  test('parseEvernoteNote() extracts ENML paragraphs and media resources', () => {
    const ast = parseEvernoteNote({
      id: 'e1',
      title: 'Evernote',
      notebook: 'Archive',
      content: '<en-note><div>Hello ENML</div><en-media hash="abc123" type="image/png" /></en-note>',
      resources: [{ resourceId: 'abc123', localPath: 'C:/assets/abc123.png', mimeType: 'image/png' }],
      created: 1000,
      modified: 2000,
    });

    expect(ast).toMatchObject({ id: 'e1', title: 'Evernote', created: 1000, modified: 2000 });
    expect(ast.blocks).toEqual([
      { type: 'paragraph', text: 'Hello ENML' },
      { type: 'image', resourceId: 'abc123', url: 'assets/abc123.png' },
    ]);
    expect(ast.resources).toEqual([{ resourceId: 'abc123', localPath: 'C:/assets/abc123.png', mimeType: 'image/png' }]);
  });
});
