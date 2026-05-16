'use strict';

const fs = require('fs');
const path = require('path');
const Exporter = require('../../src/main/exporter');
const { toMarkdown } = require('../../src/main/converter/markdown');
const { parseYoudaoNote } = require('../../src/main/converter/parser');

function makeTmpDir(name) {
  const root = path.join(__dirname, '../..', 'tmp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

describe('Youdao export quality', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('nu-youdao-quality');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('preserves raw markdown with angle brackets instead of flattening it as markup', () => {
    const raw = [
      '好的，下面给您提供完整的清理、配置和验证步骤。',
      '',
      '---',
      '',
      '## 二、配置 Nginx 反向代理',
      '',
      '```nginx',
      'server_name <example.com>;',
      'proxy_pass http://127.0.0.1:8080;',
      '```',
      '',
      '验证完成。',
    ].join('\n');

    const ast = parseYoudaoNote({ fileId: 'WEB1', title: 'Nginx代理kite服务.md' }, Buffer.from(raw));
    const markdown = toMarkdown(ast, { includeAttachments: true });

    expect(markdown).toContain('---\n\n## 二、配置 Nginx 反向代理');
    expect(markdown).toContain('```nginx\nserver_name <example.com>;\nproxy_pass http://127.0.0.1:8080;\n```');
    expect(markdown).not.toContain('--- ## 二、配置');
  });

  test('strips Youdao note suffixes before adding markdown extension', async () => {
    const exporter = new Exporter();
    const destinationDir = path.join(tmpDir, 'out');

    await exporter.start({
      source: 'test',
      format: 'markdown',
      destinationDir,
      notes: [
        { id: 'n1', title: 'README.note', modified: 1778127049, blocks: [{ type: 'paragraph', text: 'note' }] },
        { id: 'n2', title: 'CommonHE.md', modified: 1778127049, blocks: [{ type: 'paragraph', text: 'md' }] },
        { id: 'n3', title: 'Map.mindmap', modified: 1778127049, blocks: [{ type: 'paragraph', text: 'mindmap' }] },
      ],
    });

    expect(fs.existsSync(path.join(destinationDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, 'CommonHE.md'))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, 'Map.md'))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, 'README.note.md'))).toBe(false);
    expect(fs.existsSync(path.join(destinationDir, 'CommonHE.md.md'))).toBe(false);
  });

  test('parses Youdao JSON blocks and image resources into markdown assets', async () => {
    const resourceId = 'WEBRESOURCEabc123';
    const sourceImage = path.join(tmpDir, resourceId);
    fs.writeFileSync(sourceImage, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const raw = JSON.stringify({
      title: 'JSON Note',
      5: [
        { 4: { s: { ti: 36 } }, 5: [{ 7: [{ 8: '一级标题' }] }] },
        { 4: { s: { ti: 28 } }, 5: [{ 7: [{ 8: '第一段' }] }] },
        { 6: 'im', 4: { u: `https://note.youdao.com/yws/api/personal/file/${resourceId}` } },
      ],
    });

    const ast = parseYoudaoNote(
      { fileId: 'WEB2', title: 'JSON.note' },
      Buffer.from(raw),
      new Map([[resourceId, { localPath: sourceImage, extension: '.png' }]])
    );
    const destinationDir = path.join(tmpDir, 'out-json');

    await new Exporter().start({
      source: 'test',
      format: 'markdown',
      destinationDir,
      includeAttachments: true,
      notes: [ast],
    });

    const markdown = fs.readFileSync(path.join(destinationDir, 'JSON.md'), 'utf-8');
    expect(markdown).toContain('# 一级标题');
    expect(markdown).toContain('第一段');
    expect(markdown).toContain(`![](assets/${resourceId}.png)`);
    expect(fs.existsSync(path.join(destinationDir, 'assets', `${resourceId}.png`))).toBe(true);
  });

  test('localizes Youdao image links inside raw markdown notes', async () => {
    const resourceId = 'WEBRESOURCEraw456';
    const sourceImage = path.join(tmpDir, resourceId);
    fs.writeFileSync(sourceImage, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const raw = [
      '# Raw Markdown',
      '',
      `![image.png](https://note.youdao.com/yws/res/102863/${resourceId}?ynotemdtimestamp=1775927643996)`,
      '',
      'done',
    ].join('\n');

    const ast = parseYoudaoNote({ fileId: 'WEB3', title: 'Raw.md' }, Buffer.from(raw), new Map([[resourceId, sourceImage]]));
    const destinationDir = path.join(tmpDir, 'out-raw');

    await new Exporter().start({
      source: 'test',
      format: 'markdown',
      destinationDir,
      includeAttachments: true,
      notes: [ast],
    });

    const markdown = fs.readFileSync(path.join(destinationDir, 'Raw.md'), 'utf-8');
    expect(markdown).toContain(`![image.png](assets/${resourceId}.png)`);
    expect(markdown).not.toContain('note.youdao.com');
    expect(fs.existsSync(path.join(destinationDir, 'assets', `${resourceId}.png`))).toBe(true);
  });

  test('omits local asset links when attachments are disabled', async () => {
    const resourceId = 'WEBRESOURCEraw789';
    const sourceImage = path.join(tmpDir, resourceId);
    fs.writeFileSync(sourceImage, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const raw = [
      '# No Attachments',
      '',
      `![image.png](https://note.youdao.com/yws/res/102863/${resourceId})`,
      '',
      'done',
    ].join('\n');
    const ast = parseYoudaoNote({ fileId: 'WEB4', title: 'NoAttachments.md' }, Buffer.from(raw), new Map([[resourceId, sourceImage]]));
    const destinationDir = path.join(tmpDir, 'out-no-attachments');

    await new Exporter().start({
      source: 'test',
      format: 'markdown',
      destinationDir,
      includeAttachments: false,
      notes: [ast],
    });

    const markdown = fs.readFileSync(path.join(destinationDir, 'NoAttachments.md'), 'utf-8');
    expect(markdown).toContain('[image: image.png]');
    expect(markdown).not.toContain('assets/');
    expect(fs.existsSync(path.join(destinationDir, 'assets'))).toBe(false);
  });

  test('preserves markdown tables and lists without flattening them', () => {
    const raw = ['# Report', '', '- item one', '- item two', '', '| A | B |', '| - | - |', '| 1 | 2 |'].join('\n');
    const ast = parseYoudaoNote({ fileId: 'WEB5', title: 'Table.md' }, Buffer.from(raw));
    const markdown = toMarkdown(ast, { includeAttachments: true });

    expect(markdown).toContain('- item one\n- item two');
    expect(markdown).toContain('| A | B |\n| - | - |\n| 1 | 2 |');
  });

  test('converts XML rich text links and strong tags to markdown', () => {
    const ast = parseYoudaoNote(
      { fileId: 'WEB6', title: 'Rich XML' },
      '<note><body><p><strong>Bold</strong> <a href="https://example.com">Link</a></p></body></note>'
    );
    const markdown = toMarkdown(ast, { includeAttachments: true });

    expect(markdown).toContain('**Bold** [Link](https://example.com)');
  });
});
