'use strict';

const youdao = require('./youdao');

const adapters = new Map();

function registerSourceAdapter(adapter) {
  if (!adapter || !adapter.id) throw new Error('Source adapter requires an id');
  adapters.set(adapter.id, adapter);
  return adapter;
}

function unregisterSourceAdapter(id) {
  adapters.delete(id);
}

function getSourceAdapter(id) {
  return adapters.get(id) || null;
}

function detectSources() {
  const detected = [];
  for (const adapter of adapters.values()) {
    const sources = typeof adapter.detect === 'function' ? adapter.detect() : [];
    for (const source of sources || []) {
      detected.push({
        source: adapter.id,
        name: adapter.name,
        status: 'detected',
        ...source,
      });
    }
  }
  return detected;
}

function listSourceTree(source) {
  const adapter = getSourceAdapter(source?.source);
  if (!adapter || typeof adapter.listTree !== 'function') return [];
  return adapter.listTree(source);
}

function collectSourceNotes(config) {
  if (Array.isArray(config.notes) && config.notes.length > 0) return config.notes;
  const adapter = getSourceAdapter(config.source);
  if (!adapter || typeof adapter.collectNotes !== 'function') return [];
  return adapter.collectNotes(config);
}

registerSourceAdapter(youdao.adapter);

module.exports = {
  collectSourceNotes,
  detectSources,
  getSourceAdapter,
  listSourceTree,
  registerSourceAdapter,
  unregisterSourceAdapter,
};
