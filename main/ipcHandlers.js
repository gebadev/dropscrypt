const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { resolveEncryptTargets, resolveDecryptTargets } = require('./fileProcessor');
const { runGpg, resolveGpgPath } = require('./gpgRunner');

function registerIpcHandlers(win) {
  // gpg.exe 存在確認
  ipcMain.on('validate:gpg', () => {
    const gpgPath = resolveGpgPath();
    win.webContents.send('validate:gpg:result', { found: !!gpgPath, path: gpgPath });
  });

  // 暗号化開始
  ipcMain.on('encrypt:start', async (_event, { filePaths, passphrase }) => {
    const targets = resolveEncryptTargets(filePaths);

    if (targets.length === 0) {
      win.webContents.send('process:complete', { success: 0, skipped: 0, failed: 0 });
      return;
    }

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

      const result = await runGpg('encrypt', inputPath, outputPath, passphrase);

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

      const result = await runGpg('decrypt', target.path, outputPath, passphrase);

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
