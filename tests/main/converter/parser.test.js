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

  test('parseYoudaoNote() preserves Youdao JSON hyperlink wrappers', () => {
    const ast = parseYoudaoNote(
      { fileId: 'n-json-link', title: 'Youdao JSON Link' },
      JSON.stringify({
        5: [
          {
            4: { l: 'h1' },
            5: [{ 7: [{ 8: '零、聚合网站' }] }],
            6: 'h',
          },
          {
            5: [
              {
                4: { hf: 'https://my.feishu.cn/docx/demo' },
                5: [{ 7: [{ 8: 'https://my.feishu.cn/docx/demo' }] }],
                6: 'li',
              },
            ],
          },
        ],
      })
    );

    expect(ast.blocks).toEqual([
      { type: 'heading', level: 1, text: '零、聚合网站', children: [{ type: 'text', text: '零、聚合网站', marks: [] }] },
      {
        type: 'paragraph',
        text: 'https://my.feishu.cn/docx/demo',
        children: [{ type: 'link', text: 'https://my.feishu.cn/docx/demo', href: 'https://my.feishu.cn/docx/demo', marks: [] }],
      },
    ]);
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

  test('parseYoudaoNote() extracts legacy Youdao XML without style metadata noise', () => {
    const ast = parseYoudaoNote(
      { fileId: 'n-legacy-xml', title: 'Legacy XML' },
      `<?xml version="1.0" encoding="UTF-8"?>
      <note xmlns="http://note.youdao.com"><body>
        <heading level="2">
          <coId>6657-1605837019247</coId>
          <text>时间格式转换：https://blog.csdn.net/hzliyaya/article/details/51441481</text>
          <inline-styles>
            <href><from>7</from><to>62</to><value>https://blog.csdn.net/hzliyaya/article/details/51441481</value></href>
            <bold><from>0</from><to>62</to><value>true</value></bold>
          </inline-styles>
          <styles/>
        </heading>
        <para><coId>1655</coId><text>byte转16进制时间格式转换：</text><inline-styles/><styles/></para>
        <code><text>cat /proc/cpuinfo</text><language>javascript</language></code>
        <image><source>https://note.youdao.com/yws/res/8503/WEBRESOURCE123</source><text/><styles><width>620</width></styles></image>
      </body></note>`,
      new Map([['WEBRESOURCE123', 'C:/assets/WEBRESOURCE123.png']])
    );

    expect(ast.blocks).toEqual([
      {
        type: 'heading',
        level: 2,
        text: '时间格式转换：https://blog.csdn.net/hzliyaya/article/details/51441481',
        children: [
          { type: 'text', text: '时间格式转换：', marks: ['bold'] },
          {
            type: 'link',
            text: 'https://blog.csdn.net/hzliyaya/article/details/51441481',
            href: 'https://blog.csdn.net/hzliyaya/article/details/51441481',
            marks: ['bold'],
          },
        ],
      },
      { type: 'paragraph', text: 'byte转16进制时间格式转换：' },
      { type: 'code', language: 'javascript', text: 'cat /proc/cpuinfo' },
      { type: 'image', resourceId: 'WEBRESOURCE123', url: 'assets/WEBRESOURCE123.png' },
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
