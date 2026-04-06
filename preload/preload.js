const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('dropscrypt', {
  platform: process.platform,

  // ファイルパス取得（Electron 32+ で File.path が廃止されたため）
  getFilePath: (file) => webUtils.getPathForFile(file),

  // レンダラー → メイン
  expandPaths: (paths) => ipcRenderer.invoke('paths:expand', paths),
  validateGpg: () => ipcRenderer.send('validate:gpg'),
  startEncrypt: (filePaths, passphrase) =>
    ipcRenderer.send('encrypt:start', { filePaths, passphrase }),
  startDecrypt: (filePaths, passphrase) =>
    ipcRenderer.send('decrypt:start', { filePaths, passphrase }),

  // 設定
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (config) => ipcRenderer.send('settings:set', config),
  browseGpg: () => ipcRenderer.invoke('settings:browse-gpg'),

  // メイン → レンダラー（イベントリスナー登録）
  onGpgValidateResult: (callback) =>
    ipcRenderer.on('validate:gpg:result', (_e, data) => callback(data)),
  onProgress: (callback) =>
    ipcRenderer.on('process:progress', (_e, data) => callback(data)),
  onComplete: (callback) =>
    ipcRenderer.on('process:complete', (_e, data) => callback(data)),
});
