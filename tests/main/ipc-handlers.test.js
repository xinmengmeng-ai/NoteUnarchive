'use strict';

describe('main IPC handlers', () => {
  test('registers clipboard write handler in the main process', async () => {
    jest.resetModules();
    const handlers = new Map();
    const clipboard = { writeText: jest.fn() };
    const app = {
      getPath: jest.fn(() => 'tmp'),
      on: jest.fn(),
      quit: jest.fn(),
      whenReady: jest.fn(() => new Promise(() => {})),
    };
    const BrowserWindow = jest.fn();
    BrowserWindow.getAllWindows = jest.fn(() => []);

    jest.doMock('electron', () => ({
      app,
      BrowserWindow,
      clipboard,
      dialog: { showOpenDialog: jest.fn() },
      ipcMain: {
        handle: jest.fn((channel, handler) => handlers.set(channel, handler)),
      },
      shell: {
        openExternal: jest.fn(),
        openPath: jest.fn(),
      },
    }));

    require('../../src/main/index');

    expect(handlers.has('clipboard:writeText')).toBe(true);
    await handlers.get('clipboard:writeText')({}, '3972679968@qq.com');
    expect(clipboard.writeText).toHaveBeenCalledWith('3972679968@qq.com');
  });
});
