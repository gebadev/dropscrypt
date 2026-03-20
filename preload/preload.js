const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('dropscrypt', {
  // ファイルパス取得（Electron 32+ で File.path が廃止されたため）
  getFilePath: (file) => webUtils.getPathForFile(file),

  // レンダラー → メイン
  validateGpg: () => ipcRenderer.send('validate:gpg'),
  startEncrypt: (filePaths, passphrase) =>
    ipcRenderer.send('encrypt:start', { filePaths, passphrase }),
  startDecrypt: (filePaths, passphrase) =>
    ipcRenderer.send('decrypt:start', { filePaths, passphrase }),

  // メイン → レンダラー（イベントリスナー登録）
  onGpgValidateResult: (callback) =>
    ipcRenderer.on('validate:gpg:result', (_e, data) => callback(data)),
  onProgress: (callback) =>
    ipcRenderer.on('process:progress', (_e, data) => callback(data)),
  onComplete: (callback) =>
    ipcRenderer.on('process:complete', (_e, data) => callback(data)),
});
