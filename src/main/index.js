'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const Exporter = require('./exporter');
const History = require('./history');
const Settings = require('./settings');
const sourceRegistry = require('./sources');

let mainWindow = null;
let exporter = null;
let history = null;
let settings = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'NoteUnarchive',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  history = new History(app.getPath('userData'));
  settings = new Settings(app.getPath('userData'));
  exporter = createExporter();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createExporter() {
  const instance = new Exporter({ history });
  instance.on('progress', (data) => mainWindow?.webContents.send('export:progress', data));
  instance.on('log', (data) => mainWindow?.webContents.send('export:log', data));
  instance.on('complete', (data) => mainWindow?.webContents.send('export:complete', data));
  return instance;
}

ipcMain.handle('sources:detect', async () => {
  return sourceRegistry.detectSources();
});

ipcMain.handle('sources:browse', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('sources:tree', async (_event, source) => {
  return sourceRegistry.listSourceTree(source);
});

ipcMain.handle('export:start', async (_event, config) => {
  return exporter.start(config);
});

ipcMain.handle('export:estimate', async (_event, config) => {
  return exporter.estimate(config);
});

ipcMain.handle('export:pause', async () => {
  return exporter.pause();
});

ipcMain.handle('export:resume', async () => {
  return exporter.resume();
});

ipcMain.handle('export:cancel', async () => {
  return exporter.cancel();
});

ipcMain.handle('history:list', async () => {
  return history.list();
});

ipcMain.handle('history:clear', async () => {
  history.clear();
  return true;
});

ipcMain.handle('settings:get', async (_event, key) => {
  return settings.get(key);
});

ipcMain.handle('settings:set', async (_event, patch) => {
  return settings.set(patch);
});

ipcMain.handle('shell:openPath', async (_event, dirPath) => {
  await shell.openPath(dirPath);
  return { ok: true };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('clipboard:writeText', async (_event, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});
