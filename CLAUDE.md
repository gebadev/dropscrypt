# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

```bash
npm start      # 開発モードで起動（Electron + GnuPG のインストールが必要）
npm run dist   # Windows インストーラー（NSIS + ポータブル EXE）を dist/ に生成
```

テスト・リントのツールは設定されていない。

## アーキテクチャ

DropSCrypt は GnuPG (gpg.exe) をラップした Electron アプリで、Windows 上でファイルをドラッグ＆ドロップで AES-256 対称暗号化／復号できる GUI を提供する。

**プロセスモデル:**

```
レンダラープロセス (renderer/index.html + renderer/renderer.js)
  ↕ contextBridge (preload/preload.js) → window.dropscrypt.*
メインプロセス (main/main.js → main/ipcHandlers.js)
  ↕ child_process.spawn
gpg.exe
```

**メインプロセス側の責務分担:**

- `main/main.js` — `BrowserWindow` 生成・アプリライフサイクル。`did-finish-load` 後に `loadConfig()` でユーザー設定を読み込み、`resolveGpgPath()` を呼んで `validate:gpg:result` をレンダラーへ送信。その後 `registerIpcHandlers(win)` を呼ぶ
- `main/ipcHandlers.js` — 全 IPC ハンドラーを登録。`encrypt:start` / `decrypt:start` では `fileProcessor` でターゲットを解決 → `loadConfig()` で設定取得 → `runGpg` でファイル単位に逐次処理 → 進捗を `process:progress` / `process:complete` でレンダラーへ push。設定・gpgパス選択・パス展開の IPC も担当
- `main/fileProcessor.js` — ドロップされたパス（ファイル or フォルダ）を処理対象ファイル一覧に変換する。`resolveEncryptTargets`: 直下の非 `.gpg` ファイルを返す。`resolveDecryptTargets`: `.gpg` ファイルのみ返す（個別ファイルとして渡された非 `.gpg` は `skip: true` オブジェクト、フォルダ内の非 `.gpg` は一覧に含めない）。`expandPaths`: フィルタなしでフォルダ直下ファイルを展開（UI 表示用）
- `main/gpgRunner.js` — `spawn` で gpg.exe を起動し stdin にパスフレーズを書き込む。失敗時は不完全な出力ファイルを削除。`resolveGpgPath()` はカスタムパス → PATH → フォールバックパス (`C:\Program Files (x86)\GnuPG\bin\gpg.exe`) の順で検索。`runGpg()` は config の `extraEncryptArgs` / `extraDecryptArgs` を gpg 引数に追加できる
- `main/config.js` — `app.getPath('userData')/config.json` に設定を永続化。`loadConfig()` / `saveConfig()` を提供。設定項目: `gpgPath`（カスタム gpg.exe パス）、`extraEncryptArgs`（暗号化追加引数）、`extraDecryptArgs`（復号追加引数）

**IPC チャンネル一覧:**

| チャンネル | 方向 | 種別 | 内容 |
| --- | --- | --- | --- |
| `encrypt:start` | renderer → main | send | `{ filePaths, passphrase }` |
| `decrypt:start` | renderer → main | send | `{ filePaths, passphrase }` |
| `validate:gpg` | renderer → main | send | gpg.exe 存在確認要求 |
| `validate:gpg:result` | main → renderer | send | `{ found: bool, path: string\|null }` |
| `process:progress` | main → renderer | send | `{ file, status, message? }` — status: `processing`/`success`/`skipped`/`failed` |
| `process:complete` | main → renderer | send | `{ success, skipped, failed }` |
| `settings:get` | renderer → main | invoke | 設定オブジェクトを返す |
| `settings:set` | renderer → main | send | 設定オブジェクトを保存 |
| `settings:browse-gpg` | renderer → main | invoke | gpg.exe 選択ダイアログを開きパスを返す（キャンセル時は `null`） |
| `paths:expand` | renderer → main | invoke | フォルダを直下ファイルに展開して返す（UI 表示用） |

## 重要な制約

- パスフレーズは **stdin のみ** 経由で gpg に渡す — CLI 引数・ログへの露出は厳禁
- パスフレーズは処理完了後に `passphrase = null` で破棄する（`ipcHandlers.js` 内）
- サブディレクトリの再帰処理は意図的に非対応
- `sandbox: true` のため `preload.js` は `contextBridge` の橋渡しのみ担う（Node.js API 直接使用不可）
- 対象プラットフォーム: Windows 10/11 64-bit のみ
