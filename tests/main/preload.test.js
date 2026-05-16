'use strict';

describe('preload API', () => {
  let exposedApi;
  let ipcRenderer;

  beforeEach(() => {
    jest.resetModules();
    ipcRenderer = {
      invoke: jest.fn((channel, payload) => Promise.resolve({ channel, payload })),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    jest.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: (_name, api) => {
          exposedApi = api;
        },
      },
      ipcRenderer,
    }));
    require('../../src/main/preload');
  });

  test('exposes the v1 renderer API names', () => {
    expect(Object.keys(exposedApi).sort()).toEqual(
      [
        'browseSource',
        'cancelExport',
        'clearHistory',
        'copyText',
        'detectSources',
        'estimateExport',
        'getSettings',
        'listSourceTree',
        'listHistory',
        'onExportComplete',
        'onExportLog',
        'onExportProgress',
        'openExternal',
        'openPath',
        'pauseExport',
        'resumeExport',
        'setSettings',
        'startExport',
      ].sort()
    );
  });

  test('invokes expected IPC channels', async () => {
    await exposedApi.browseSource();
    await exposedApi.clearHistory();
    await exposedApi.estimateExport({ format: 'markdown' });
    await exposedApi.listSourceTree({ source: 'youdao' });
    await exposedApi.startExport({ format: 'markdown' });
    await exposedApi.openExternal('https://github.com/xinmengmeng-ai');
    await exposedApi.openPath('C:/out');
    await exposedApi.copyText('3972679968@qq.com');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('sources:browse');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('history:clear');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('export:estimate', { format: 'markdown' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('sources:tree', { source: 'youdao' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('export:start', { format: 'markdown' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('shell:openExternal', 'https://github.com/xinmengmeng-ai');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('shell:openPath', 'C:/out');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('clipboard:writeText', '3972679968@qq.com');
  });

  test('event subscriptions return unsubscribe functions', () => {
    const callback = jest.fn();

    const unsubscribe = exposedApi.onExportProgress(callback);
    const handler = ipcRenderer.on.mock.calls[0][1];
    handler({}, { percent: 50 });
    unsubscribe();

    expect(ipcRenderer.on).toHaveBeenCalledWith('export:progress', expect.any(Function));
    expect(callback).toHaveBeenCalledWith({ percent: 50 });
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('export:progress', handler);
  });
});
