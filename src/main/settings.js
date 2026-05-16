'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  autoDetect: true,
  sha256: true,
  defaultExportDir: null,
  threads: 4,
  customPaths: {},
  language: 'zh-CN',
};

class Settings {
  constructor(userDataPath) {
    this._filePath = path.join(userDataPath, 'settings.json');
    this._data = null;
  }

  _load() {
    if (this._data) return;

    try {
      const raw = fs.readFileSync(this._filePath, 'utf-8');
      this._data = Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch {
      this._data = Object.assign({}, DEFAULTS);
    }
  }

  get(key) {
    this._load();

    if (key === undefined) return Object.assign({}, this._data);
    return this._data[key];
  }

  set(updates) {
    this._load();
    Object.assign(this._data, updates);
    fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf-8');
    return this._data;
  }
}

module.exports = Settings;
