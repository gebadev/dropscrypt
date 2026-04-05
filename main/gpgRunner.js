const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FALLBACK_GPG_PATH = process.platform === 'win32'
  ? 'C:\\Program Files (x86)\\GnuPG\\bin\\gpg.exe'
  : '/usr/bin/gpg';

/**
 * gpg.exe のパスを解決する。
 * @param {string} [customPath] - 設定で指定されたパス（空文字 or 未指定なら自動検出）
 */
function resolveGpgPath(customPath) {
  if (customPath && customPath.trim()) {
    return fs.existsSync(customPath.trim()) ? customPath.trim() : null;
  }

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
 * 追加引数文字列をスペース区切りで配列に変換する。
 * @param {string} str
 * @returns {string[]}
 */
function parseExtraArgs(str) {
  if (!str || !str.trim()) return [];
  return str.trim().split(/\s+/);
}

/**
 * gpg.exe を実行してファイルを暗号化または復号する。
 * @param {'encrypt'|'decrypt'} mode
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} passphrase
 * @param {{ gpgPath?: string, extraEncryptArgs?: string, extraDecryptArgs?: string }} [config]
 * @returns {Promise<{success: boolean, stderr: string}>}
 */
function runGpg(mode, inputPath, outputPath, passphrase, config = {}) {
  return new Promise((resolve) => {
    const gpgPath = resolveGpgPath(config.gpgPath);
    if (!gpgPath) {
      const gpgName = process.platform === 'win32' ? 'gpg.exe' : 'gpg';
      resolve({ success: false, stderr: `${gpgName} が見つかりません` });
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
      args.push(...parseExtraArgs(config.extraEncryptArgs));
    } else {
      args.push('--decrypt');
      args.push(...parseExtraArgs(config.extraDecryptArgs));
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
