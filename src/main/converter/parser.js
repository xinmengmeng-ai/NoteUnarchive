'use strict';

const path = require('path');
const { parseMarkupBlocks } = require('./markup-parser');
const { parseYoudaoContent } = require('./youdao-parser');

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function extensionFromResource(resource) {
  if (resource.extension) return resource.extension;
  if (resource.mimeType && MIME_EXT[resource.mimeType]) return MIME_EXT[resource.mimeType];
  if (resource.localPath) {
    const ext = path.extname(resource.localPath);
    if (ext) return ext;
  }
  return '.png';
}

function normalizeResource(resourceId, value) {
  if (!resourceId) return null;
  const resource = typeof value === 'string' ? { localPath: value } : Object.assign({}, value || {});
  const extension = extensionFromResource(resource);
  const assetFileName = resource.assetFileName || `${resourceId}${extension}`;
  return {
    resourceId,
    localPath: resource.localPath || '',
    mimeType: resource.mimeType || '',
    extension,
    assetFileName,
  };
}

function assetUrlFor(resourceId, knownResources) {
  if (!resourceId) return '';
  const resource = knownResources.get(resourceId);
  if (!resource) return '';
  return `assets/${resource.assetFileName}`;
}

function resourceLookup(resources) {
  if (resources instanceof Map) {
    const lookupFromMap = new Map();
    for (const [resourceId, value] of resources.entries()) {
      const resource = normalizeResource(resourceId, value);
      if (resource) lookupFromMap.set(resourceId, resource);
    }
    return lookupFromMap;
  }
  const lookup = new Map();
  for (const resource of resources || []) {
    const resourceId = resource.resourceId || resource.resourceID;
    const normalized = normalizeResource(resourceId, resource);
    if (normalized) lookup.set(resourceId, normalized);
  }
  return lookup;
}

function resourcesFromBlocks(blocks, sourceResources, knownResources) {
  const explicit = new Map();
  for (const resource of sourceResources || []) {
    if (resource.resourceId) explicit.set(resource.resourceId, resource);
  }

  const resources = [];
  const seen = new Set();
  for (const block of blocks) {
    if (block.type !== 'image' || !block.resourceId || seen.has(block.resourceId)) continue;
    seen.add(block.resourceId);
    const existing = explicit.get(block.resourceId);
    const resource = knownResources.get(block.resourceId);
    if (existing) {
      resources.push({
        resourceId: existing.resourceId,
        localPath: existing.localPath || resource?.localPath || '',
        mimeType: existing.mimeType || resource?.mimeType || '',
      });
      continue;
    }

    resources.push(
      resource
        ? {
            resourceId: resource.resourceId,
            localPath: resource.localPath || '',
            mimeType: resource.mimeType || '',
          }
        : {
            resourceId: block.resourceId,
            localPath: '',
            mimeType: '',
          }
    );
  }
  return resources;
}

function resourcesFromIds(resourceIds, knownResources) {
  const blocks = Array.from(resourceIds).map((resourceId) => ({ type: 'image', resourceId }));
  return resourcesFromBlocks(blocks, [], knownResources);
}

function uniqueResources(resources) {
  const seen = new Set();
  const unique = [];
  for (const resource of resources) {
    if (!resource.resourceId || seen.has(resource.resourceId)) continue;
    seen.add(resource.resourceId);
    unique.push(resource);
  }
  return unique;
}

function makeAst(note, blocks, resources) {
  return {
    id: note.id || note.fileId || '',
    title: note.title || 'Untitled',
    created: note.created || note.createTime || 0,
    modified: note.modified || note.modifyTime || 0,
    notebook: note.notebook || '',
    tags: Array.isArray(note.tags) ? note.tags : [],
    blocks,
    resources,
  };
}

function sourceResourcesFromNote(note) {
  if (Array.isArray(note.resources)) return note.resources;
  if (!note.resourcesJson && !note.rawResources) return [];
  try {
    return JSON.parse(note.resourcesJson || note.rawResources || '[]');
  } catch {
    return [];
  }
}

function parseYoudaoNote(note, rawContent, resourceIndex = new Map()) {
  const content = Buffer.isBuffer(rawContent) ? rawContent.toString('utf-8') : String(rawContent || '');
  const knownResources = resourceLookup(resourceIndex);
  const { blocks, markdownResourceIds } = parseYoudaoContent(content, knownResources);

  const resources = uniqueResources([
    ...resourcesFromBlocks(blocks, sourceResourcesFromNote(note), knownResources),
    ...resourcesFromIds(markdownResourceIds, knownResources),
  ]);
  return makeAst(note, blocks, resources);
}

function parseEvernoteNote(note) {
  const knownResources = resourceLookup(note.resources || []);
  const blocks = parseMarkupBlocks(note.content || '', knownResources);
  return makeAst(note, blocks, resourcesFromBlocks(blocks, note.resources || [], knownResources));
}

module.exports = {
  parseEvernoteNote,
  parseYoudaoNote,
};
