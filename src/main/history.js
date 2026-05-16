'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class History {
  constructor(userDataPath) {
    this._filePath = path.join(userDataPath, 'history.json');
    this._records = null;
  }

  _load() {
    if (this._records) return;

    try {
      const raw = fs.readFileSync(this._filePath, 'utf-8');
      const records = JSON.parse(raw);
      this._records = Array.isArray(records) ? records : [];
    } catch {
      this._records = [];
    }
  }

  _save() {
    fs.writeFileSync(this._filePath, JSON.stringify(this._records, null, 2), 'utf-8');
  }

  list() {
    this._load();
    return [...this._records].reverse();
  }

  add(record) {
    this._load();
    const entry = Object.assign(
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        status: 'COMPLETED',
      },
      record
    );

    this._records.push(entry);
    this._save();
    return entry;
  }

  update(id, updates) {
    this._load();
    const index = this._records.findIndex((record) => record.id === id);
    if (index === -1) return null;

    Object.assign(this._records[index], updates);
    this._save();
    return this._records[index];
  }

  clear() {
    this._records = [];
    this._save();
  }
}

module.exports = History;
