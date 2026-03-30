const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');
const { resolveGpgPath } = require('./gpgRunner');
const { loadConfig } = require('./config');

function createWindow() {
  const win = new BrowserWindow({
    width: 720,
    height: 600,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  registerIpcHandlers(win);

  // gpg.exe 存在確認（起動後に通知）
  win.webContents.once('did-finish-load', () => {
    const config = loadConfig();
    const gpgPath = resolveGpgPath(config.gpgPath);
    win.webContents.send('validate:gpg:result', { found: !!gpgPath, path: gpgPath });
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
