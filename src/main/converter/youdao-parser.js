'use strict';

const { parseMarkupBlocks } = require('./markup-parser');
const { attrsFrom, decodeEntities } = require('./rich-text');

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

function uniqueMarks(marks) {
  return Array.from(new Set((marks || []).filter(Boolean)));
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

function extractYoudaoInline(inline, inheritedHref = '', inheritedMarks = []) {
  const text = String(inline?.['8'] || '');
  const style = inline?.['4']?.s || inline?.s || {};
  const href = inline?.['4']?.u || inline?.['4']?.hf || inline?.u || inline?.href || inheritedHref;
  const marks = uniqueMarks([...inheritedMarks, ...marksFromYoudaoStyle(style)]);
  if (href) return { type: 'link', text, href, marks };
  return { type: 'text', text, marks };
}

function collectYoudaoJsonInlines(node, inheritedHref = '', inheritedMarks = []) {
  if (typeof node === 'string') return [{ type: 'text', text: node, marks: uniqueMarks(inheritedMarks) }].filter((inline) => inline.text);
  if (!node || typeof node !== 'object') return [];

  const style = node?.['4']?.s || node?.s || {};
  const href = node?.['4']?.hf || node?.['4']?.u || node?.hf || node?.u || node?.href || inheritedHref;
  const marks = uniqueMarks([...inheritedMarks, ...marksFromYoudaoStyle(style)]);
  const inlines = [];

  if (node['8']) inlines.push(extractYoudaoInline(node, href, marks));
  for (const inline of node['7'] || []) {
    const parsed = extractYoudaoInline(inline, href, marks);
    if (parsed.text) inlines.push(parsed);
  }
  for (const child of node['5'] || []) {
    inlines.push(...collectYoudaoJsonInlines(child, href, marks));
  }

  return inlines.filter((inline) => inline.text);
}

function headingLevelFromYoudaoBlock(block, style) {
  const layout = block?.['4']?.l || '';
  const layoutMatch = String(layout).match(/^h([1-6])$/i);
  if (layoutMatch) return Number(layoutMatch[1]);
  if (block['6'] === 'h') return 2;
  return YOUDAO_HEADING_TI[style.ti || 28] || 0;
}

function normalizeYoudaoJsonBlock(block, knownResources) {
  if (!block || typeof block !== 'object') return null;

  if (block['6'] === 'im') {
    const url = block['4']?.u || '';
    const resourceId = lastPathSegment(url);
    return { type: 'image', resourceId, url: assetUrlFor(resourceId, knownResources) || url };
  }

  const style = block['4']?.s || {};
  const headingLevel = headingLevelFromYoudaoBlock(block, style);
  const children = collectYoudaoJsonInlines(block);

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

function tagText(xml, tagName) {
  const match = String(xml || '').match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  if (!match) return '';
  return decodeEntities(match[1].replace(/<[^>]+>/g, ''));
}

function styleRanges(inner) {
  const ranges = [];
  const pattern = /<(bold|italic|underline|strike|href)\b[^>]*>\s*<from>(\d+)<\/from>\s*<to>(\d+)<\/to>\s*<value>([\s\S]*?)<\/value>\s*<\/\1>/gi;
  let match;

  while ((match = pattern.exec(String(inner || '')))) {
    const type = match[1].toLowerCase();
    const from = Number(match[2]);
    const to = Number(match[3]);
    const value = decodeEntities(match[4]);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    if (type === 'href') {
      if (value) ranges.push({ from, to, href: value });
      continue;
    }
    if (value !== 'true') continue;
    const markMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      strike: 'strike',
    };
    if (markMap[type]) ranges.push({ from, to, mark: markMap[type] });
  }

  return ranges;
}

function legacyXmlInlines(text, inner) {
  const ranges = styleRanges(inner);
  if (!ranges.length) return [];
  const boundaries = new Set([0, text.length]);
  for (const range of ranges) {
    boundaries.add(Math.max(0, Math.min(text.length, range.from)));
    boundaries.add(Math.max(0, Math.min(text.length, range.to)));
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const inlines = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (to <= from) continue;
    const segment = text.slice(from, to);
    if (!segment) continue;
    const active = ranges.filter((range) => range.from < to && range.to > from);
    const href = active.find((range) => range.href)?.href || '';
    const marks = uniqueMarks(active.map((range) => range.mark));
    if (href) inlines.push({ type: 'link', text: segment, href, marks });
    else inlines.push({ type: 'text', text: segment, marks });
  }
  return inlines;
}

function blockWithLegacyInlines(type, text, inner, extra = {}) {
  const block = { type, ...extra, text };
  const children = legacyXmlInlines(text, inner);
  if (children.length) block.children = children;
  return block;
}

function parseYoudaoLegacyXml(content, knownResources) {
  const blocks = [];
  const raw = String(content || '');
  const body = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || raw;
  const blockPattern = /<(heading|para|code|image)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = blockPattern.exec(body))) {
    const tag = match[1].toLowerCase();
    const attrs = attrsFrom(match[0]);
    const inner = match[3] || '';

    if (tag === 'image') {
      const source = tagText(inner, 'source');
      const resourceId = lastPathSegment(source);
      if (resourceId) blocks.push({ type: 'image', resourceId, url: assetUrlFor(resourceId, knownResources) || source });
      continue;
    }

    if (tag === 'code') {
      const text = tagText(inner, 'text');
      if (text) blocks.push({ type: 'code', language: tagText(inner, 'language'), text });
      continue;
    }

    const text = tagText(inner, 'text');
    if (!text.trim()) continue;
    if (tag === 'heading') {
      blocks.push(blockWithLegacyInlines('heading', text, inner, { level: Number(attrs.level || 2) || 2 }));
      continue;
    }
    blocks.push(blockWithLegacyInlines('paragraph', text, inner));
  }

  return blocks;
}

function parseYoudaoContent(content, knownResources) {
  try {
    return { blocks: parseYoudaoBlocks(content, knownResources), markdownResourceIds: new Set() };
  } catch {
    const raw = String(content || '');
    const localized = localizeMarkdownImageLinks(raw, knownResources);
    if (/^<\?xml\b/i.test(raw.trimStart()) && /<(heading|para|image|code)\b/i.test(raw)) {
      const legacyBlocks = parseYoudaoLegacyXml(raw, knownResources);
      if (legacyBlocks.length) return { blocks: legacyBlocks, markdownResourceIds: localized.resourceIds };
    }
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
