'use strict';

const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');
const {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
} = require('docx');
const { parseMarkupBlocks } = require('./markup-parser');
const { inlineText } = require('./rich-text');

const markdown = new MarkdownIt({ linkify: true });
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

function headingLevel(level) {
  const map = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];
  return map[Math.max(1, Math.min(6, Number(level) || 1)) - 1];
}

function imageLabel(block) {
  return path.basename(block.url || block.resourceId || 'image');
}

function imageType(resource, block) {
  if (resource.mimeType && IMAGE_TYPES[resource.mimeType]) return IMAGE_TYPES[resource.mimeType];
  const candidates = [resource.localPath, resource.fileName, resource.assetFileName, block?.url].filter(Boolean);
  for (const candidate of candidates) {
    const ext = path.extname(candidate).toLowerCase();
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
    if (ext === '.gif') return 'gif';
    if (ext === '.bmp') return 'bmp';
  }
  const data = resourceData(resource);
  if (data) return imageTypeFromSignature(data);
  return '';
}

function imageTypeFromSignature(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'BM') return 'bmp';
  return '';
}

function resourceData(resource) {
  if (resource.data) return Buffer.isBuffer(resource.data) ? resource.data : Buffer.from(resource.data);
  if (resource.localPath && fs.existsSync(resource.localPath)) return fs.readFileSync(resource.localPath);
  return null;
}

function resourceLookup(resources = []) {
  const lookup = new Map();
  for (const resource of resources) {
    const keys = [
      resource.resourceId,
      resource.assetFileName,
      resource.fileName,
      path.basename(resource.localPath || ''),
    ].filter(Boolean);
    for (const key of keys) {
      lookup.set(String(key), resource);
      lookup.set(`assets/${String(key)}`, resource);
    }
  }
  return lookup;
}

function resolveResource(block, resources) {
  const urlBase = path.basename(block.url || '');
  const urlStem = path.parse(urlBase).name;
  return (
    resources.get(block.resourceId || '') ||
    resources.get(block.url || '') ||
    resources.get(urlBase) ||
    resources.get(urlStem) ||
    null
  );
}

function runOptions(inline, text) {
  const marks = Array.isArray(inline?.marks) ? inline.marks : [];
  return {
    text,
    bold: marks.includes('bold'),
    italics: marks.includes('italic'),
    strike: marks.includes('strike'),
    underline: marks.includes('underline') ? { type: UnderlineType.SINGLE } : undefined,
    font: inline?.type === 'code' ? 'Consolas' : undefined,
  };
}

function splitTextWithUrls(text) {
  const parts = [];
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  let offset = 0;
  let match;

  while ((match = pattern.exec(String(text || '')))) {
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    let url = match[0];
    let trailing = '';
    const trailingMatch = url.match(/[.,;:!?]+$/);
    if (trailingMatch) {
      trailing = trailingMatch[0];
      url = url.slice(0, -trailing.length);
    }
    if (url) parts.push({ text: url, href: url });
    if (trailing) parts.push({ text: trailing });
    offset = match.index + match[0].length;
  }

  if (offset < String(text || '').length) parts.push({ text: String(text || '').slice(offset) });
  return parts.length ? parts : [{ text: String(text || '') }];
}

function hyperlinkRun(inline, text, href) {
  return new ExternalHyperlink({
    children: [new TextRun({ ...runOptions(inline, text), underline: { type: UnderlineType.SINGLE }, color: '0563C1' })],
    link: href,
  });
}

function inlineRuns(children, fallback = '') {
  const inlines = Array.isArray(children) && children.length > 0 ? children : [{ type: 'text', text: fallback }];
  return inlines
    .filter((inline) => inlineText(inline))
    .flatMap((inline) => {
      const text = inlineText(inline);
      if (inline.type === 'link' && inline.href) {
        return [hyperlinkRun(inline, text, inline.href)];
      }
      if (inline.type === 'code') return [new TextRun(runOptions(inline, text))];
      return splitTextWithUrls(text).map((part) => (part.href ? hyperlinkRun(inline, part.text, part.href) : new TextRun(runOptions(inline, part.text))));
    });
}

function tableFromBlock(block) {
  const rows = (block.rows || []).map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: inlineRuns(cell) })],
            })
        ),
      })
  );
  return rows.length ? new Table({ rows }) : null;
}

function markdownBlocks(block, resources) {
  const html = markdown.render(block.text || '');
  return parseMarkupBlocks(html, resources);
}

function paragraphForImage(block, resources, options) {
  if (options.includeAttachments === false) {
    return new Paragraph({ children: [new TextRun(`[image: ${imageLabel(block)}]`)] });
  }

  const resource = resolveResource(block, resources);
  const type = resource ? imageType(resource, block) : '';
  const data = resource ? resourceData(resource) : null;
  if (!resource || !type || !data) {
    return new Paragraph({ children: [new TextRun(`[image: ${imageLabel(block)}]`)] });
  }

  return new Paragraph({
    children: [
      new ImageRun({
        type,
        data,
        transformation: {
          width: 480,
          height: 320,
        },
      }),
    ],
  });
}

function blocksToDocxChildren(blocks, resources, options) {
  const children = [];
  for (const block of blocks || []) {
    switch (block.type) {
      case 'markdown':
        children.push(...blocksToDocxChildren(markdownBlocks(block, resources), resources, options));
        break;
      case 'heading':
        children.push(
          new Paragraph({
            heading: headingLevel(block.level),
            children: inlineRuns(block.children, block.text),
          })
        );
        break;
      case 'image':
        children.push(paragraphForImage(block, resources, options));
        break;
      case 'code':
        children.push(new Paragraph({ children: [new TextRun({ text: block.text || '', font: 'Consolas' })] }));
        break;
      case 'list':
        (block.items || []).forEach((item, index) => {
          const prefix = block.ordered ? `${index + 1}. ` : '';
          children.push(
            new Paragraph({
              bullet: block.ordered ? undefined : { level: 0 },
              children: [...(prefix ? [new TextRun(prefix)] : []), ...inlineRuns(item)],
            })
          );
        });
        break;
      case 'todo':
        children.push(
          new Paragraph({
            children: [new TextRun(`[${block.checked ? 'x' : ' '}] `), ...inlineRuns(block.children, block.text)],
          })
        );
        break;
      case 'blockquote':
        children.push(
          new Paragraph({
            indent: { left: 360 },
            children: inlineRuns(block.children, block.text),
          })
        );
        break;
      case 'table': {
        const table = tableFromBlock(block);
        if (table) children.push(table);
        break;
      }
      case 'html':
        children.push(...blocksToDocxChildren(parseMarkupBlocks(block.html || block.text || '', resources), resources, options));
        break;
      case 'paragraph':
      default:
        children.push(new Paragraph({ children: inlineRuns(block.children, block.text) }));
        break;
    }
  }
  return children;
}

async function toDocxBuffer(ast, options = {}) {
  const resources = resourceLookup(ast.resources || []);
  const document = new Document({
    sections: [
      {
        children: blocksToDocxChildren(ast.blocks || [], resources, options),
      },
    ],
  });
  return Packer.toBuffer(document);
}

module.exports = {
  toDocxBuffer,
};
