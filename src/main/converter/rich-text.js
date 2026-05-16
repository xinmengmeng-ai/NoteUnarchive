'use strict';

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attrsFrom(tag) {
  const attrs = {};
  const attrPattern = /([:\w-]+)\s*=\s*["']([^"']*)["']/g;
  let match;
  while ((match = attrPattern.exec(tag))) {
    attrs[match[1]] = decodeEntities(match[2]);
  }
  return attrs;
}

function normalizeInline(value) {
  if (typeof value === 'string') return { type: 'text', text: value };
  if (!value || typeof value !== 'object') return { type: 'text', text: '' };
  return value;
}

function inlineText(inline) {
  const item = normalizeInline(inline);
  return String(item.text || item.alt || '');
}

function renderInline(inline) {
  const item = normalizeInline(inline);
  const rawText = inlineText(item);
  const leading = rawText.match(/^\s*/)?.[0] || '';
  const trailing = rawText.match(/\s*$/)?.[0] || '';
  let rendered = rawText.slice(leading.length, rawText.length - trailing.length);

  if (item.type === 'code') {
    rendered = `\`${rendered.replace(/`/g, '\\`')}\``;
  } else if (item.type === 'link' && item.href) {
    rendered = `[${rendered}](${item.href})`;
  }

  const marks = Array.isArray(item.marks) ? item.marks : [];
  if (marks.includes('bold')) rendered = `**${rendered}**`;
  if (marks.includes('italic')) rendered = `*${rendered}*`;
  if (marks.includes('strike')) rendered = `~~${rendered}~~`;
  if (marks.includes('underline')) rendered = `<u>${rendered}</u>`;
  return leading + rendered + trailing;
}

function renderInlines(children, fallback = '') {
  if (Array.isArray(children) && children.length > 0) {
    return children.map(renderInline).join('').replace(/[ \t]{2,}/g, ' ').trim();
  }
  return String(fallback || '');
}

module.exports = {
  attrsFrom,
  decodeEntities,
  inlineText,
  renderInline,
  renderInlines,
  stripTags,
};
