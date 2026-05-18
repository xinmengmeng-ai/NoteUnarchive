'use strict';

const fs = require('fs');
const path = require('path');

describe('renderer interactions', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf-8');

  test('does not present unsupported demo sources as exportable cards', () => {
    expect(html).not.toContain('Notion');
    expect(html).not.toContain('Obsidian');
    expect(html).not.toContain('Bear');
    expect(html).not.toContain('Local Database Detected');
  });

  test('progress screen does not ship prototype progress or fake log rows', () => {
    expect(html).not.toContain('Personal_Wiki_Vault');
    expect(html).not.toContain('Note_001.md');
    expect(html).not.toContain('6,450');
    expect(html).not.toContain('4,201');
    expect(html).not.toContain('Local_Drive_D/Archives/2024');
    expect(html).not.toContain('/Archives/2024');
    expect(html).not.toContain('1.4 GB');
    expect(html).not.toContain("['#screen-progress h2 + p', 'progress.description']");
  });

  test('visible utility controls have explicit action hooks', () => {
    expect(html).toContain('data-action="refresh-sources"');
    expect(html).toContain('data-action="show-help"');
    expect(html).toContain('data-action="open-github"');
    expect(html).toContain('data-action="copy-support-qq"');
    expect(html).toContain('3972679968@qq.com');
    expect(html).toContain('https://github.com/xinmengmeng-ai');
    expect(html).toContain('data-action="custom-path"');
    expect(html).toContain('data-screen="history" data-scroll-target="settings"');
  });

  test('sidebar uses packaged project logo asset', () => {
    expect(html).toContain('src="./assets/logo.jpg"');
    expect(html).toContain('alt="NoteUnarchive logo"');
    expect(fs.existsSync(path.join(__dirname, '../../src/renderer/assets/logo.jpg'))).toBe(true);
  });

  test('all static buttons and hash links declare an interaction contract', () => {
    const bareButtons = [...html.matchAll(/<button\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => !/data-action=|data-screen=|data-language-toggle=|type=/.test(tag));
    const bareHashLinks = [...html.matchAll(/<a\b[^>]*href="#"/g)]
      .map((match) => match[0])
      .filter((tag) => !/data-action=|data-screen=/.test(tag));

    expect(bareButtons).toEqual([]);
    expect(bareHashLinks).toEqual([]);
  });

  test('renderer wires utility actions to source and help handlers', () => {
    expect(html).toContain('reloadSources');
    expect(html).toContain('addCustomSource');
    expect(html).toContain('showToast');
  });

  test('renderer contains validation and no-active-task feedback paths', () => {
    expect(html).toContain('function validateExportConfig');
    expect(html).toContain('toast.selectSourceDir');
    expect(html).toContain('toast.selectDestinationDir');
    expect(html).toContain('toast.noRunningExport');
  });

  test('export scope uses notebook hierarchy selection instead of date filters', () => {
    expect(html).toContain('data-config-source-select');
    expect(html).toContain('data-note-folder-select');
    expect(html).toContain('data-note-folder-search');
    expect(html).toContain('data-all-documents-label');
    expect(html).toContain('renderConfigSourceOptions');
    expect(html).toContain('setSelectedSource');
    expect(html).toContain('config.source');
    expect(html).toContain('loadNotebookTree');
    expect(html).toContain('renderNotebookOptions');
    expect(html).toContain('filterNotebookTree');
    expect(html).toContain('listSourceTree');
    expect(html).toContain('notebookPath');
    expect(html).toContain('window._loadNotebookTree?.()');
    expect(html).not.toContain('folder_tree');
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain('name="modifiedAfter"');
    expect(html).not.toContain('name="modifiedBefore"');
  });

  test('format cards expose per-card check icons and update them from renderer state', () => {
    expect([...html.matchAll(/<span data-format-check/g)]).toHaveLength(3);
    expect(html).toContain('value="markdown"');
    expect(html).toContain('value="docx"');
    expect(html).toContain('value="html"');
    expect(html).not.toContain('value="json"');
    expect(html).toContain('Word');
    expect(html).toContain("checkIcon.classList.toggle('hidden', !input.checked)");
  });

  test('progress controls are disabled when export is not running or has completed', () => {
    expect(html).toContain('function updateProgressControls');
    expect(html).toContain('pauseButton.disabled = !exportRunning');
    expect(html).toContain('cancelButton.disabled = !exportRunning');
    expect(html).toContain('setRunningState(false)');
  });

  test('config navigation restores notebook tree without requiring manual refresh', () => {
    expect(html).toContain("if (key === 'config')");
    expect(html).toContain('window._ensureNotebookTree?.()');
    expect(html).toContain('notebookTreeCache');
  });

  test('destination space estimate is not shipped as a hard-coded fake number', () => {
    expect(html).not.toContain('1.2GB');
    expect(html).toContain('data-export-estimate');
    expect(html).toContain('estimateExport');
    expect(html).toContain('updateExportEstimate');
  });

  test('history actions support open path and retry from record config', () => {
    expect(html).toContain('record.config');
    expect(html).toContain('selectedSource = Object.assign');
    expect(html).toContain('openPath');
    expect(html).toContain("record.format === 'json'");
    expect(html).toContain('data-retry-disabled');
  });
});
