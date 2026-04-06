const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { resolveEncryptTargets, resolveDecryptTargets, expandPaths } = require('./fileProcessor');
const { runGpg, resolveGpgPath } = require('./gpgRunner');
const { loadConfig, saveConfig } = require('./config');

function registerIpcHandlers(win) {
  // gpg.exe 存在確認
  ipcMain.on('validate:gpg', () => {
    const config = loadConfig();
    const gpgPath = resolveGpgPath(config.gpgPath);
    win.webContents.send('validate:gpg:result', { found: !!gpgPath, path: gpgPath });
  });

  // 設定取得
  ipcMain.handle('settings:get', () => loadConfig());

  // 設定保存
  ipcMain.on('settings:set', (_e, config) => saveConfig(config));

  // フォルダ → 直下ファイル展開
  ipcMain.handle('paths:expand', (_e, droppedPaths) => expandPaths(droppedPaths));

  // gpg.exe ファイル選択ダイアログ
  ipcMain.handle('settings:browse-gpg', async () => {
    const isWin = process.platform === 'win32';
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: isWin ? 'gpg.exe を選択' : 'gpg を選択',
      filters: isWin ? [{ name: 'Executable', extensions: ['exe'] }] : [],
      properties: ['openFile'],
    });
    return canceled ? null : filePaths[0];
  });

  // 暗号化開始
  ipcMain.on('encrypt:start', async (_event, { filePaths, passphrase }) => {
    const targets = resolveEncryptTargets(filePaths);

    if (targets.length === 0) {
      win.webContents.send('process:complete', { success: 0, skipped: 0, failed: 0 });
      return;
    }

    const config = loadConfig();
    let success = 0, skipped = 0, failed = 0;

    for (const inputPath of targets) {
      const outputPath = inputPath + '.gpg';
      const fileName = path.basename(inputPath);

      // 既存ファイルチェック
      if (fs.existsSync(outputPath)) {
        skipped++;
        win.webContents.send('process:progress', {
          file: fileName,
          status: 'skipped',
          message: 'スキップ（既存ファイルあり）',
        });
        continue;
      }

      win.webContents.send('process:progress', { file: fileName, status: 'processing' });

      const result = await runGpg('encrypt', inputPath, outputPath, passphrase, config);

      if (result.success) {
        success++;
        win.webContents.send('process:progress', { file: fileName, status: 'success' });
      } else {
        failed++;
        win.webContents.send('process:progress', {
          file: fileName,
          status: 'failed',
          message: result.stderr || '不明なエラー',
        });
      }
    }

    // パスフレーズを破棄（変数スコープを抜けるが念のためヒント）
    passphrase = null;

    win.webContents.send('process:complete', { success, skipped, failed });
  });

  // 復号開始
  ipcMain.on('decrypt:start', async (_event, { filePaths, passphrase }) => {
    const targets = resolveDecryptTargets(filePaths);

    if (targets.length === 0) {
      win.webContents.send('process:complete', { success: 0, skipped: 0, failed: 0 });
      return;
    }

    const config = loadConfig();
    let success = 0, skipped = 0, failed = 0;

    for (const target of targets) {
      const fileName = path.basename(target.path);

      if (target.skip) {
        skipped++;
        win.webContents.send('process:progress', {
          file: fileName,
          status: 'skipped',
          message: target.skipReason,
        });
        continue;
      }

      // 出力パス（末尾の .gpg を除去）
      const outputPath = target.path.replace(/\.gpg$/i, '');

      if (fs.existsSync(outputPath)) {
        skipped++;
        win.webContents.send('process:progress', {
          file: fileName,
          status: 'skipped',
          message: 'スキップ（既存ファイルあり）',
        });
        continue;
      }

      win.webContents.send('process:progress', { file: fileName, status: 'processing' });

      const result = await runGpg('decrypt', target.path, outputPath, passphrase, config);

      if (result.success) {
        success++;
        win.webContents.send('process:progress', { file: fileName, status: 'success' });
      } else {
        failed++;
        const isWrongPassphrase = result.code === 2 &&
          /bad session key|decryption failed/i.test(result.stderr);
        const message = isWrongPassphrase
          ? 'パスフレーズが正しくない可能性があります'
          : (result.stderr || '不明なエラー');
        win.webContents.send('process:progress', { file: fileName, status: 'failed', message });
      }
    }

    passphrase = null;

    win.webContents.send('process:complete', { success, skipped, failed });
  });
}

module.exports = { registerIpcHandlers };
