const fs = require('fs');
const path = require('path');

/**
 * ドロップされたパス一覧から暗号化対象ファイルを列挙する。
 * - ファイルなら 1 件そのまま追加
 * - フォルダならフォルダ直下のファイル（.gpg 除く）を追加
 * @param {string[]} droppedPaths
 * @returns {string[]}
 */
function resolveEncryptTargets(droppedPaths) {
  const targets = [];
  for (const p of droppedPaths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(p, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.toLowerCase().endsWith('.gpg')) {
          targets.push(path.join(p, entry.name));
        }
      }
    } else if (stat.isFile()) {
      targets.push(p);
    }
  }
  return targets;
}

/**
 * ドロップされたパス一覧から復号対象ファイルを列挙する。
 * .gpg ファイル以外はスキップ扱いで返す。
 * @param {string[]} droppedPaths
 * @returns {{ path: string, skip: boolean, skipReason?: string }[]}
 */
function resolveDecryptTargets(droppedPaths) {
  const targets = [];
  for (const p of droppedPaths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(p, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fullPath = path.join(p, entry.name);
        if (entry.name.toLowerCase().endsWith('.gpg')) {
          targets.push({ path: fullPath, skip: false });
        }
        // .gpg 以外のファイルは無視（一覧にも追加しない）
      }
    } else if (stat.isFile()) {
      if (p.toLowerCase().endsWith('.gpg')) {
        targets.push({ path: p, skip: false });
      } else {
        targets.push({ path: p, skip: true, skipReason: '.gpg ファイルではありません' });
      }
    }
  }
  return targets;
}

module.exports = { resolveEncryptTargets, resolveDecryptTargets };
