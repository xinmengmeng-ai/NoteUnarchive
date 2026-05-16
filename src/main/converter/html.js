'use strict';

const path = require('path');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function imageLabel(block) {
  return path.basename(block.url || block.resourceId || 'image');
}

function blockToHtml(block, options) {
  switch (block.type) {
    case 'heading': {
      const level = Math.max(1, Math.min(6, block.level || 1));
      return `<h${level}>${escapeHtml(block.text)}</h${level}>`;
    }
    case 'image':
      if (options.includeAttachments === false) return `<p>${escapeHtml(`[image: ${imageLabel(block)}]`)}</p>`;
      return `<p><img src="${escapeHtml(block.url || '')}" alt=""></p>`;
    case 'code':
      return `<pre><code>${escapeHtml(block.text || '')}</code></pre>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = (block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'paragraph':
    default:
      return `<p>${escapeHtml(block.text || '')}</p>`;
  }
}

function toHtml(ast, options = {}) {
  const body = (ast.blocks || []).map((block) => blockToHtml(block, options)).join('\n');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(ast.title || 'Untitled')}</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;line-height:1.6;max-width:760px;margin:40px auto;padding:0 24px;color:#202124}
img{max-width:100%;height:auto}
pre{background:#f6f8fa;padding:16px;overflow:auto}
code{font-family:Consolas,monospace}
</style>
</head>
<body>
<h1>${escapeHtml(ast.title || 'Untitled')}</h1>
${body}
</body>
</html>`;
}

module.exports = {
  toHtml,
};
