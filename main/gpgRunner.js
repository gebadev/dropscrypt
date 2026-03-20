const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FALLBACK_GPG_PATH = 'C:\\Program Files (x86)\\GnuPG\\bin\\gpg.exe';

function resolveGpgPath() {
  // 1. PATH から検索
  try {
    const result = execFileSync('gpg', ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (result) return 'gpg';
  } catch (_) {
    // PATH にない
  }

  // 2. フォールバックパスを直接確認
  if (fs.existsSync(FALLBACK_GPG_PATH)) return FALLBACK_GPG_PATH;

  return null;
}

/**
 * gpg.exe を実行してファイルを暗号化または復号する。
 * @param {'encrypt'|'decrypt'} mode
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} passphrase
 * @returns {Promise<{success: boolean, stderr: string}>}
 */
function runGpg(mode, inputPath, outputPath, passphrase) {
  return new Promise((resolve) => {
    const gpgPath = resolveGpgPath();
    if (!gpgPath) {
      resolve({ success: false, stderr: 'gpg.exe が見つかりません' });
      return;
    }

    const args = [
      '--batch',
      '--passphrase-fd', '0',
      '--pinentry-mode', 'loopback',
      '--output', outputPath,
    ];

    if (mode === 'encrypt') {
      args.push('--symmetric', '--cipher-algo', 'AES256');
    } else {
      args.push('--decrypt');
    }
    args.push(inputPath);

    const proc = spawn(gpgPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      resolve({ success: false, stderr: err.message });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stderr });
      } else {
        // 不完全な出力ファイルを削除
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) {}
        resolve({ success: false, stderr, code });
      }
    });

    // パスフレーズを標準入力に書き込んでから閉じる
    proc.stdin.write(passphrase);
    proc.stdin.end();
  });
}

module.exports = { resolveGpgPath, runGpg };
