'use strict';

const sourceRegistry = require('../../../src/main/sources');

describe('source adapter registry', () => {
  afterEach(() => {
    sourceRegistry.unregisterSourceAdapter('fake');
  });

  test('v1 public registry exposes Youdao as the only built-in source', () => {
    expect(sourceRegistry.getSourceAdapter('youdao')).not.toBeNull();
    expect(sourceRegistry.getSourceAdapter('evernote')).toBeNull();
  });

  test('registers a new source without changing exporter source branches', () => {
    sourceRegistry.registerSourceAdapter({
      id: 'fake',
      name: 'Fake Notes',
      detect: () => [{ account: 'fixture' }],
      listTree: () => [{ id: 'root', title: 'Root', path: 'Root', noteCount: 1, children: [] }],
      collectNotes: () => [{ id: 'n1', title: 'Fake', notebook: 'Root', blocks: [{ type: 'paragraph', text: 'hello' }], resources: [] }],
    });

    expect(sourceRegistry.getSourceAdapter('fake').name).toBe('Fake Notes');
    expect(sourceRegistry.detectSources()).toContainEqual({
      source: 'fake',
      name: 'Fake Notes',
      status: 'detected',
      account: 'fixture',
    });
    expect(sourceRegistry.listSourceTree({ source: 'fake' })).toEqual([
      { id: 'root', title: 'Root', path: 'Root', noteCount: 1, children: [] },
    ]);
    expect(sourceRegistry.collectSourceNotes({ source: 'fake' })).toHaveLength(1);
  });

  test('unknown source ids return empty tree and notes', () => {
    expect(sourceRegistry.getSourceAdapter('missing')).toBeNull();
    expect(sourceRegistry.listSourceTree({ source: 'missing' })).toEqual([]);
    expect(sourceRegistry.collectSourceNotes({ source: 'missing' })).toEqual([]);
  });
});
