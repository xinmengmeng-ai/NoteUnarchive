'use strict';

const fs = require('fs');
const path = require('path');
const evernote = require('../../../src/main/sources/evernote');

function makeTmpDir(name) {
  const root = path.join(__dirname, '../../../..', 'tmp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

function sampleEnex(resources = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<en-export>
  <note>
    <title>Sample Note</title>
    <created>20240101T010203Z</created>
    <updated>20240102T030405Z</updated>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><en-note><div>Hello Evernote</div></en-note>]]></content>
    ${resources}
  </note>
</en-export>`;
}

describe('Evernote source', () => {
  let tmpDir;
  let oldLocalAppData;

  beforeEach(() => {
    tmpDir = makeTmpDir('nu-evernote');
    oldLocalAppData = process.env.LOCALAPPDATA;
  });

  afterEach(() => {
    if (oldLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = oldLocalAppData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detect() returns empty array when LOCALAPPDATA is not set', () => {
    delete process.env.LOCALAPPDATA;

    expect(evernote.detect()).toEqual([]);
  });

  test('detect() finds Evernote database directory and ENEX files', () => {
    process.env.LOCALAPPDATA = tmpDir;
    const dataDir = path.join(tmpDir, 'Evernote', 'Evernote', 'Databases');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'note.enex'), sampleEnex());

    expect(evernote.detect()).toEqual([
      {
        account: 'Evernote',
        dataDir,
        enexFiles: [path.join(dataDir, 'note.enex')],
      },
    ]);
  });

  test('parseEnex() parses a single note and timestamps', () => {
    const enexPath = path.join(tmpDir, 'sample.enex');
    fs.writeFileSync(enexPath, sampleEnex());

    const notes = evernote.parseEnex(enexPath);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'sample.enex:0',
      title: 'Sample Note',
      content: '<?xml version="1.0" encoding="UTF-8"?><en-note><div>Hello Evernote</div></en-note>',
      resources: [],
    });
    expect(notes[0].created).toBe(Date.UTC(2024, 0, 1, 1, 2, 3));
    expect(notes[0].modified).toBe(Date.UTC(2024, 0, 2, 3, 4, 5));
  });

  test('parseEnex() decodes embedded base64 resources', () => {
    const enexPath = path.join(tmpDir, 'resources.enex');
    const resources = `
      <resource><data encoding="base64">aGVsbG8=</data><mime>text/plain</mime><resource-attributes><file-name>a.txt</file-name></resource-attributes></resource>
      <resource><data encoding="base64">d29ybGQ=</data><mime>text/plain</mime><resource-attributes><file-name>b.txt</file-name></resource-attributes></resource>
    `;
    fs.writeFileSync(enexPath, sampleEnex(resources));

    const [note] = evernote.parseEnex(enexPath);

    expect(note.resources).toHaveLength(2);
    expect(note.resources[0]).toMatchObject({ mimeType: 'text/plain', fileName: 'a.txt' });
    expect(note.resources[0].data.toString('utf-8')).toBe('hello');
    expect(note.resources[1].data.toString('utf-8')).toBe('world');
  });

  test('parseEnex() throws a diagnostic error for invalid ENEX', () => {
    const enexPath = path.join(tmpDir, 'bad.enex');
    fs.writeFileSync(enexPath, '<en-export><note><title>Broken</title>');

    expect(() => evernote.parseEnex(enexPath)).toThrow(/Invalid ENEX/);
  });
});
