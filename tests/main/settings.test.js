'use strict';

const fs = require('fs');
const path = require('path');
const Settings = require('../../src/main/settings');

function makeTmpDir(name) {
  const root = path.join(__dirname, '../..', 'tmp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

describe('Settings', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('nu-settings');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns defaults when no file exists', () => {
    const settings = new Settings(tmpDir);

    expect(settings.get('autoDetect')).toBe(true);
    expect(settings.get('threads')).toBe(4);
    expect(settings.get('sha256')).toBe(true);
    expect(settings.get('language')).toBe('zh-CN');
  });

  test('get() with no key returns full settings object', () => {
    const settings = new Settings(tmpDir);
    const all = settings.get();

    expect(all).toHaveProperty('autoDetect');
    expect(all).toHaveProperty('threads');
    expect(all).toHaveProperty('language', 'zh-CN');
  });

  test('set() persists to disk and returns updated data', () => {
    const settings = new Settings(tmpDir);
    const result = settings.set({ threads: 8 });

    expect(result.threads).toBe(8);

    const reloadedSettings = new Settings(tmpDir);
    expect(reloadedSettings.get('threads')).toBe(8);
  });

  test('set() merges with existing values', () => {
    const settings = new Settings(tmpDir);

    settings.set({ threads: 2 });
    settings.set({ sha256: false });

    expect(settings.get('threads')).toBe(2);
    expect(settings.get('sha256')).toBe(false);
    expect(settings.get('autoDetect')).toBe(true);
  });

  test('loads existing file on first access', () => {
    const filePath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(filePath, JSON.stringify({ threads: 6, autoDetect: false }));

    const settings = new Settings(tmpDir);

    expect(settings.get('threads')).toBe(6);
    expect(settings.get('autoDetect')).toBe(false);
    expect(settings.get('sha256')).toBe(true);
    expect(settings.get('language')).toBe('zh-CN');
  });

  test('set() persists language preference', () => {
    const settings = new Settings(tmpDir);

    settings.set({ language: 'en-US' });

    expect(new Settings(tmpDir).get('language')).toBe('en-US');
  });
});
