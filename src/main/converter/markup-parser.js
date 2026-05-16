'use strict';

const { attrsFrom, decodeEntities, stripTags } = require('./rich-text');

function cloneMarks(marks) {
  return Array.from(new Set(marks || []));
}

function parseInlineHtml(html, inheritedMarks = []) {
  const inlines = [];
  const tagPattern = /<(\/?)(strong|b|em|i|s|del|u|a|code)\b([^>]*)>|([^<]+)/gi;
  const marks = cloneMarks(inheritedMarks);
  const linkStack = [];
  let match;

  while ((match = tagPattern.exec(String(html || '')))) {
    if (match[4]) {
      const text = decodeEntities(match[4]).replace(/\s+/g, ' ');
      if (!text) continue;
      const href = linkStack[linkStack.length - 1];
      if (href) inlines.push({ type: 'link', text, href, marks: cloneMarks(marks) });
      else if (marks.includes('code')) inlines.push({ type: 'code', text, marks: cloneMarks(marks).filter((mark) => mark !== 'code') });
      else inlines.push({ type: 'text', text, marks: cloneMarks(marks) });
      continue;
    }

    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const attrs = attrsFrom(match[0]);
    const markMap = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', s: 'strike', del: 'strike', u: 'underline', code: 'code' };
    if (tag === 'a') {
      if (closing) linkStack.pop();
      else linkStack.push(attrs.href || '');
      continue;
    }
    const mark = markMap[tag];
    if (!mark) continue;
    if (closing) {
      const index = marks.lastIndexOf(mark);
      if (index >= 0) marks.splice(index, 1);
    } else {
      marks.push(mark);
    }
  }

  return inlines.filter((inline) => inline.text);
}

function isPlainTextInline(inline) {
  return (
    inline &&
    inline.type === 'text' &&
    !inline.href &&
    (!Array.isArray(inline.marks) || inline.marks.length === 0)
  );
}

function blockWithInline(type, text, children, extra = {}) {
  const block = { type, ...extra, text };
  if (children.length && !children.every(isPlainTextInline)) block.children = children;
  return block;
}

function parseTable(tableHtml) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableHtml))) {
    const cells = [];
    const cellPattern = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      cells.push(parseInlineHtml(cellMatch[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows.length ? { type: 'table', rows } : null;
}

function mediaBlockFromTag(tag, knownResources) {
  const attrs = attrsFrom(tag);
  const rawId = attrs.resourceId || attrs.hash || attrs.src || attrs['data-resource-id'] || '';
  const resourceId = rawId.replace(/^resource:\/\//, '').replace(/^https?:\/\/[^/]+\//, '');
  if (!resourceId) return null;
  const resource = knownResources.get(resourceId);
  return { type: 'image', resourceId, url: resource ? `assets/${resource.assetFileName}` : attrs.src || '' };
}

function parseMarkupBlocks(content, knownResources = new Map()) {
  const blocks = [];
  const raw = String(content || '');
  const blockPattern =
    /<(pre|blockquote|table|ul|ol|p|div|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<(img|en-media)\b[^>]*\/?>/gi;
  let match;

  while ((match = blockPattern.exec(raw))) {
    const tag = (match[1] || match[3] || '').toLowerCase();
    const inner = match[2] || '';

    if (tag === 'img' || tag === 'en-media') {
      const image = mediaBlockFromTag(match[0], knownResources);
      if (image) blocks.push(image);
      continue;
    }
    if (tag === 'pre') {
      blocks.push({ type: 'code', text: stripTags(inner) });
      continue;
    }
    if (tag === 'blockquote') {
      blocks.push(blockWithInline('blockquote', stripTags(inner), parseInlineHtml(inner)));
      continue;
    }
    if (tag === 'table') {
      const table = parseTable(match[0]);
      if (table) blocks.push(table);
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [];
      const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(inner))) {
        items.push(parseInlineHtml(itemMatch[1]));
      }
      if (items.length) blocks.push({ type: 'list', ordered: tag === 'ol', items });
      continue;
    }
    if (tag.startsWith('h')) {
      blocks.push(blockWithInline('heading', stripTags(inner), parseInlineHtml(inner), { level: Number(tag.slice(1)) }));
      continue;
    }
    const children = parseInlineHtml(inner);
    const text = stripTags(inner);
    if (children.length || text) blocks.push(blockWithInline('paragraph', text, children));
  }

  return blocks.length ? blocks : [{ type: 'paragraph', text: stripTags(raw) }].filter((block) => block.text);
}

module.exports = {
  parseInlineHtml,
  parseMarkupBlocks,
};
