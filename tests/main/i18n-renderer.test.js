'use strict';

const { createI18n } = require('../../src/renderer/i18n');

describe('renderer i18n', () => {
  test('translates navigation labels in Chinese and English', () => {
    const i18n = createI18n('zh-CN');

    expect(i18n.t('nav.sources')).toBe('数据源');
    i18n.setLanguage('en-US');
    expect(i18n.t('nav.sources')).toBe('Sources');
  });

  test('interpolates export completion log parameters', () => {
    const i18n = createI18n('en-US');

    expect(i18n.t('progress.complete', { status: 'COMPLETED', exported: 2, skipped: 1, errors: 0 })).toBe(
      'Export COMPLETED: 2 exported, 1 skipped, 0 errors.'
    );
  });

  test('returns unknown keys as a safe fallback', () => {
    const i18n = createI18n('zh-CN');

    expect(i18n.t('missing.key')).toBe('missing.key');
  });

  test('covers source selection and export log labels', () => {
    const i18n = createI18n('zh-CN');

    expect(i18n.t('sources.customPath')).toBe('自定义路径');
    expect(i18n.t('progress.targetPrefix')).toBe('目标：');
    i18n.setLanguage('en-US');
    expect(i18n.t('config.rebuildHierarchy')).toBe('Rebuild folders');
    expect(i18n.t('status.RUNNING')).toBe('RUNNING');
    expect(i18n.t('status.IDLE')).toBe('IDLE');
  });

  test('formats real export size estimate copy with parameters', () => {
    const i18n = createI18n('zh-CN');

    expect(i18n.t('config.diskSpaceEstimateReady', { notes: 3, attachments: 2, size: '4.0 KB' })).toBe(
      '当前范围：3 条笔记，2 个附件，预计写入 4.0 KB。'
    );
    i18n.setLanguage('en-US');
    expect(i18n.t('config.diskSpaceEstimateNoAttachments', { notes: 1, size: '2.0 KB' })).toBe(
      'Selected scope: 1 notes, attachments disabled, estimated write size 2.0 KB.'
    );
  });
});
