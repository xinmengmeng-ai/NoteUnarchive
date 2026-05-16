'use strict';

const { parseMarkupBlocks } = require('./markup-parser');

const YOUDAO_HEADING_TI = {
  36: 1,
  32: 2,
  28: 0,
};

function assetUrlFor(resourceId, knownResources) {
  if (!resourceId) return '';
  const resource = knownResources.get(resourceId);
  if (!resource) return '';
  return `assets/${resource.assetFileName}`;
}

function lastPathSegment(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.split(/[/?#]/)[text.split(/[/?#]/).length - 1];
}

function marksFromYoudaoStyle(style = {}) {
  const marks = [];
  if (style.b || style.bold) marks.push('bold');
  if (style.i || style.italic) marks.push('italic');
  if (style.s || style.strike || style.del) marks.push('strike');
  if (style.u || style.underline) marks.push('underline');
  return marks;
}

function inlineFromGeneric(value) {
  if (typeof value === 'string') return { type: 'text', text: value };
  if (!value || typeof value !== 'object') return { type: 'text', text: '' };
  if (value.type === 'link') return { type: 'link', text: value.text || '', href: value.href || value.url || '', marks: value.marks || [] };
  if (value.type === 'code') return { type: 'code', text: value.text || '' };
  return { type: 'text', text: value.text || value.content || '', marks: value.marks || [] };
}

function normalizeJsonBlock(block, knownResources) {
  if (!block || typeof block !== 'object') return null;

  if (block.type === 'markdown') return { type: 'markdown', text: String(block.text || block.content || '') };
  if (block.type === 'heading') {
    const heading = { type: 'heading', level: block.level || 1, text: String(block.text || '') };
    const children = (block.children || []).map(inlineFromGeneric).filter((inline) => inline.text);
    if (children.length) heading.children = children;
    return heading;
  }
  if (block.type === 'paragraph') {
    const paragraph = { type: 'paragraph', text: String(block.text || block.content || '') };
    const children = (block.children || []).map(inlineFromGeneric).filter((inline) => inline.text);
    if (children.length) paragraph.children = children;
    return paragraph;
  }
  if (block.type === 'image') {
    const resourceId = block.resourceId || block.id || '';
    return { type: 'image', resourceId, url: block.url || assetUrlFor(resourceId, knownResources) };
  }
  if (block.type === 'code') return { type: 'code', language: block.language || '', text: String(block.text || '') };
  if (block.type === 'todo') return { type: 'todo', checked: Boolean(block.checked), children: (block.children || [block.text || '']).map(inlineFromGeneric) };
  if (block.type === 'blockquote') return { type: 'blockquote', children: (block.children || [block.text || '']).map(inlineFromGeneric) };
  if (block.type === 'table') return { type: 'table', rows: block.rows || [] };
  if (block.type === 'list') {
    return {
      type: 'list',
      ordered: Boolean(block.ordered),
      items: Array.isArray(block.items) ? block.items.map((item) => (Array.isArray(item) ? item.map(inlineFromGeneric) : [inlineFromGeneric(item)])) : [],
    };
  }

  return { type: 'paragraph', text: String(block.text || block.content || '') };
}

function extractYoudaoInline(inline) {
  const text = String(inline?.['8'] || '');
  const style = inline?.['4']?.s || inline?.s || {};
  const href = inline?.['4']?.u || inline?.u || inline?.href || '';
  if (href) return { type: 'link', text, href, marks: marksFromYoudaoStyle(style) };
  return { type: 'text', text, marks: marksFromYoudaoStyle(style) };
}

function normalizeYoudaoJsonBlock(block, knownResources) {
  if (!block || typeof block !== 'object') return null;

  if (block['6'] === 'im') {
    const url = block['4']?.u || '';
    const resourceId = lastPathSegment(url);
    return { type: 'image', resourceId, url: assetUrlFor(resourceId, knownResources) || url };
  }

  const style = block['4']?.s || {};
  const headingLevel = YOUDAO_HEADING_TI[style.ti || 28] || 0;
  const children = [];
  for (const child of block['5'] || []) {
    for (const inline of child['7'] || []) {
      const parsed = extractYoudaoInline(inline);
      if (parsed.text) children.push(parsed);
    }
  }

  const text = children.map((item) => item.text || '').join('');
  if (!text.trim()) return null;
  if (headingLevel) return { type: 'heading', level: headingLevel, text, children };
  return { type: 'paragraph', text, children };
}

function localizeMarkdownImageLinks(content, knownResources) {
  const resourceIds = new Set();
  const localized = String(content || '').replace(
    /!\[([^\]]*)\]\((https?:\/\/note\.youdao\.com\/[^)\s]*?(WEBRESOURCE[0-9a-zA-Z]+)[^)\s]*)\)/g,
    (match, label, url, resourceId) => {
      const assetUrl = assetUrlFor(resourceId, knownResources);
      if (!assetUrl) return match;
      resourceIds.add(resourceId);
      return `![${label}](${assetUrl})`;
    }
  );
  return { content: localized, resourceIds };
}

function looksLikeMarkdown(content) {
  return /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)/.test(String(content || ''));
}

function parseYoudaoBlocks(content, knownResources) {
  const parsed = JSON.parse(content);
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed['5'])) {
    return parsed['5'].map((block) => normalizeYoudaoJsonBlock(block, knownResources)).filter(Boolean);
  }

  const rawBlocks = Array.isArray(parsed) ? parsed : parsed.blocks || parsed.content || [];
  if (Array.isArray(rawBlocks)) return rawBlocks.map((block) => normalizeJsonBlock(block, knownResources)).filter(Boolean);
  if (typeof rawBlocks === 'string') return [{ type: 'markdown', text: rawBlocks }];
  return [{ type: 'paragraph', text: JSON.stringify(parsed) }];
}

function parseYoudaoContent(content, knownResources) {
  try {
    return { blocks: parseYoudaoBlocks(content, knownResources), markdownResourceIds: new Set() };
  } catch {
    const raw = String(content || '');
    const localized = localizeMarkdownImageLinks(raw, knownResources);
    if (/^<\?xml\b/i.test(raw.trimStart()) || /^<(note|en-note|html|body|div|p|h[1-6])\b/i.test(raw.trimStart())) {
      return { blocks: parseMarkupBlocks(raw, knownResources), markdownResourceIds: localized.resourceIds };
    }
    if (looksLikeMarkdown(localized.content)) {
      return { blocks: [{ type: 'markdown', text: localized.content }], markdownResourceIds: localized.resourceIds };
    }
    return {
      blocks: String(localized.content)
        .split(/\r?\n\s*\r?\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((text) => ({ type: 'paragraph', text })),
      markdownResourceIds: localized.resourceIds,
    };
  }
}

module.exports = {
  localizeMarkdownImageLinks,
  parseYoudaoContent,
};
