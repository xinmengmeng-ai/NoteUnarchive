'use strict';

const path = require('path');
const { renderInlines } = require('./rich-text');

function imageLabel(block) {
  return path.basename(block.url || block.resourceId || 'image');
}

function omitMarkdownImages(text) {
  return String(text || '').replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, label) => {
    return `[image: ${label || 'image'}]`;
  });
}

function blockToMarkdown(block, options) {
  switch (block.type) {
    case 'markdown':
      return options.includeAttachments === false ? omitMarkdownImages(block.text) : block.text || '';
    case 'heading':
      return `${'#'.repeat(Math.max(1, Math.min(6, block.level || 1)))} ${renderInlines(block.children, block.text)}`;
    case 'image':
      if (options.includeAttachments === false) return `[image: ${imageLabel(block)}]`;
      return `![](${block.url || ''})`;
    case 'code':
      return `\`\`\`${block.language || ''}\n${block.text || ''}\n\`\`\``;
    case 'list':
      return (block.items || [])
        .map((item, index) => {
          const text = Array.isArray(item) ? renderInlines(item) : typeof item === 'object' ? blockToMarkdown(item, options) : String(item || '');
          return block.ordered ? `${index + 1}. ${text}` : `- ${text}`;
        })
        .join('\n');
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${renderInlines(block.children, block.text)}`;
    case 'blockquote':
      return renderInlines(block.children, block.text)
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n');
    case 'table':
      return tableToMarkdown(block);
    case 'html':
      return block.html || block.text || '';
    case 'paragraph':
    default:
      return options.includeAttachments === false ? omitMarkdownImages(renderInlines(block.children, block.text)) : renderInlines(block.children, block.text);
  }
}

function tableCellToMarkdown(cell) {
  const text = Array.isArray(cell) ? renderInlines(cell) : String(cell || '');
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function tableToMarkdown(block) {
  const rows = block.rows || [];
  if (!rows.length) return '';
  const header = rows[0].map(tableCellToMarkdown);
  const divider = header.map(() => '---');
  const body = rows.slice(1).map((row) => row.map(tableCellToMarkdown));
  return [header, divider, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function toMarkdown(ast, options = {}) {
  return (ast.blocks || [])
    .map((block) => blockToMarkdown(block, options))
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
}

module.exports = {
  toMarkdown,
};
