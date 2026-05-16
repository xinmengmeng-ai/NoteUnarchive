'use strict';

const { toMarkdown } = require('./markdown');

function toJson(ast, options = {}) {
  const includeAttachments = options.includeAttachments !== false;
  const attachments = includeAttachments
    ? (ast.resources || []).map((resource) => ({
        filename: `assets/${require('path').basename(resource.localPath || resource.fileName || resource.resourceId || 'asset')}`,
        mimeType: resource.mimeType || '',
      }))
    : [];

  return {
    id: ast.id,
    title: ast.title,
    created: ast.created,
    modified: ast.modified,
    notebook: ast.notebook,
    tags: ast.tags || [],
    content: toMarkdown(ast, options),
    attachments,
  };
}

module.exports = {
  toJson,
};
