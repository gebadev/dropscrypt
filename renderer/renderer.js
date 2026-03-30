'use strict';

// --- 要素参照 ---
const dropZone       = document.getElementById('drop-zone');
const passphraseInput = document.getElementById('passphrase');
const toggleBtn      = document.getElementById('toggle-passphrase');
const passphraseError = document.getElementById('passphrase-error');
const btnEncrypt     = document.getElementById('btn-encrypt');
const btnDecrypt     = document.getElementById('btn-decrypt');
const fileTbody      = document.getElementById('file-tbody');
const progressBar    = document.getElementById('progress-bar');
const statusText     = document.getElementById('status-text');
const gpgWarning     = document.getElementById('gpg-warning');
const btnSettings    = document.getElementById('btn-settings');

// 設定モーダル要素
const settingsOverlay   = document.getElementById('settings-overlay');
const settingsGpgPath   = document.getElementById('settings-gpg-path');
const settingsBrowse    = document.getElementById('settings-browse');
const settingsEncArgs   = document.getElementById('settings-encrypt-args');
const settingsDecArgs   = document.getElementById('settings-decrypt-args');
const settingsCancel    = document.getElementById('settings-cancel');
const settingsSave      = document.getElementById('settings-save');

// --- 状態 ---
let droppedPaths = [];   // ドロップされたファイル/フォルダパス
let isProcessing = false;
let gpgAvailable = false;

// ファイル行の index → { fileName, rowEl } のマップ
const rowMap = new Map();
let totalFiles = 0;
let doneCount = 0;

// --- gpg 存在確認 ---
window.dropscrypt.onGpgValidateResult((data) => {
  gpgAvailable = data.found;
  if (!data.found) {
    gpgWarning.classList.remove('hidden');
    btnEncrypt.disabled = true;
    btnDecrypt.disabled = true;
  } else {
    gpgWarning.classList.add('hidden');
  }
  updateButtons();
});

// Electron のデフォルト動作（ドロップファイルをページとして読み込む）を抑制
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// --- ドラッグ＆ドロップ ---
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  if (isProcessing) return;

  const files = Array.from(e.dataTransfer.files);
  if (files.length === 0) return;

  droppedPaths = files.map((f) => window.dropscrypt.getFilePath(f));
  renderDroppedPaths();
  updateButtons();
});

function renderDroppedPaths() {
  fileTbody.innerHTML = '';
  rowMap.clear();
  totalFiles = 0;
  doneCount = 0;
  progressBar.style.width = '0%';

  for (const p of droppedPaths) {
    const tr = document.createElement('tr');
    const nameParts = p.replace(/\\/g, '/').split('/');
    const displayName = nameParts[nameParts.length - 1];
    tr.innerHTML = `
      <td class="col-name" title="${escHtml(p)}">${escHtml(displayName)}</td>
      <td class="col-size">-</td>
      <td class="col-status">-</td>
    `;
    fileTbody.appendChild(tr);
  }

  statusText.textContent = `${droppedPaths.length} 件のパスが選択されました`;
}

// --- パスフレーズ 表示/非表示トグル ---
toggleBtn.addEventListener('click', () => {
  if (passphraseInput.type === 'password') {
    passphraseInput.type = 'text';
    toggleBtn.textContent = '非表示';
  } else {
    passphraseInput.type = 'password';
    toggleBtn.textContent = '表示';
  }
});

// --- ボタン制御 ---
function updateButtons() {
  const hasFiles = droppedPaths.length > 0;
  btnEncrypt.disabled = !gpgAvailable || !hasFiles || isProcessing;
  btnDecrypt.disabled = !gpgAvailable || !hasFiles || isProcessing;
}

// --- 暗号化 ---
btnEncrypt.addEventListener('click', () => {
  if (!validatePassphrase()) return;
  startProcess('encrypt');
});

// --- 復号 ---
btnDecrypt.addEventListener('click', () => {
  if (!validatePassphrase()) return;
  startProcess('decrypt');
});

function validatePassphrase() {
  const val = passphraseInput.value;
  if (!val) {
    passphraseInput.classList.add('input-error');
    passphraseError.classList.remove('hidden');
    return false;
  }
  passphraseInput.classList.remove('input-error');
  passphraseError.classList.add('hidden');
  return true;
}

function startProcess(mode) {
  isProcessing = true;
  updateButtons();

  // ファイル行を初期化（処理中状態に）
  fileTbody.innerHTML = '';
  rowMap.clear();
  doneCount = 0;
  progressBar.style.width = '0%';

  const passphrase = passphraseInput.value;

  if (mode === 'encrypt') {
    statusText.textContent = '暗号化中...';
    window.dropscrypt.startEncrypt(droppedPaths, passphrase);
  } else {
    statusText.textContent = '復号中...';
    window.dropscrypt.startDecrypt(droppedPaths, passphrase);
  }
}

// --- 進捗通知 ---
window.dropscrypt.onProgress((data) => {
  const { file, status, message } = data;

  let row = rowMap.get(file);
  if (!row) {
    const tr = document.createElement('tr');
    fileTbody.appendChild(tr);
    rowMap.set(file, tr);
    row = tr;
    totalFiles++;
  }

  const label = statusLabel(status, message);
  row.innerHTML = `
    <td class="col-name" title="${escHtml(file)}">${escHtml(file)}</td>
    <td class="col-size">-</td>
    <td class="col-status ${statusClass(status)}">${label}</td>
  `;

  if (status !== 'processing') {
    doneCount++;
    if (totalFiles > 0) {
      progressBar.style.width = `${Math.round((doneCount / totalFiles) * 100)}%`;
    }
  }
});

// --- 完了通知 ---
window.dropscrypt.onComplete((data) => {
  const { success, skipped, failed } = data;
  isProcessing = false;
  progressBar.style.width = '100%';
  statusText.textContent =
    `完了 — 成功: ${success}　スキップ: ${skipped}　失敗: ${failed}`;
  updateButtons();
});

// --- 設定モーダル ---
btnSettings.addEventListener('click', async () => {
  const config = await window.dropscrypt.getSettings();
  settingsGpgPath.value  = config.gpgPath        || '';
  settingsEncArgs.value  = config.extraEncryptArgs || '';
  settingsDecArgs.value  = config.extraDecryptArgs || '';
  settingsOverlay.classList.remove('hidden');
});

settingsCancel.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

settingsBrowse.addEventListener('click', async () => {
  const selected = await window.dropscrypt.browseGpg();
  if (selected) settingsGpgPath.value = selected;
});

settingsSave.addEventListener('click', () => {
  const config = {
    gpgPath:          settingsGpgPath.value.trim(),
    extraEncryptArgs: settingsEncArgs.value.trim(),
    extraDecryptArgs: settingsDecArgs.value.trim(),
  };
  window.dropscrypt.setSettings(config);
  settingsOverlay.classList.add('hidden');

  // gpg パスが変わった可能性があるので再検証
  window.dropscrypt.validateGpg();
});

// --- ヘルパー ---
function statusLabel(status, message) {
  switch (status) {
    case 'processing': return '⏳ 処理中';
    case 'success':    return '✅ 完了';
    case 'skipped':    return `⏭ スキップ${message ? '（' + escHtml(message) + '）' : ''}`;
    case 'failed':     return `❌ 失敗${message ? '（' + escHtml(message) + '）' : ''}`;
    default:           return '-';
  }
}

function statusClass(status) {
  return {
    processing: 'status-processing',
    success:    'status-success',
    skipped:    'status-skipped',
    failed:     'status-failed',
  }[status] ?? '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
