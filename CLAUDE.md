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

- `main/main.js` — `BrowserWindow` 生成・アプリライフサイクル。起動時に `resolveGpgPath()` を呼び `validate:gpg:result` を送信してから `registerIpcHandlers(win)` に `win` 参照を渡す
- `main/ipcHandlers.js` — `encrypt:start` / `decrypt:start` の IPC を受け取り、`fileProcessor` でターゲットを解決 → `runGpg` でファイル単位に逐次処理 → 進捗を `process:progress` / `process:complete` でレンダラーへ push
- `main/fileProcessor.js` — ドロップされたパス（ファイル or フォルダ）を実際の処理対象ファイル一覧に変換する。暗号化は `.gpg` を除く直下ファイル、復号は `.gpg` のみ（非 `.gpg` ファイルは `skip: true` オブジェクトとして返す）
- `main/gpgRunner.js` — `spawn` で gpg.exe を起動し stdin にパスフレーズを書き込む。失敗時は不完全な出力ファイルを削除。`resolveGpgPath()` は PATH → フォールバックパス (`C:\Program Files (x86)\GnuPG\bin\gpg.exe`) の順で検索

**IPC チャンネル一覧:**

| チャンネル | 方向 | 内容 |
| --- | --- | --- |
| `encrypt:start` | renderer → main | `{ filePaths, passphrase }` |
| `decrypt:start` | renderer → main | `{ filePaths, passphrase }` |
| `validate:gpg` | renderer → main | gpg.exe 存在確認要求 |
| `validate:gpg:result` | main → renderer | `{ found: bool, path: string\|null }` |
| `process:progress` | main → renderer | `{ file, status, message? }` — status: `processing`/`success`/`skipped`/`failed` |
| `process:complete` | main → renderer | `{ success, skipped, failed }` |

## 重要な制約

- パスフレーズは **stdin のみ** 経由で gpg に渡す — CLI 引数・ログへの露出は厳禁
- パスフレーズは処理完了後に `passphrase = null` で破棄する（`ipcHandlers.js` 内）
- サブディレクトリの再帰処理は意図的に非対応
- `sandbox: true` のため `preload.js` は `contextBridge` の橋渡しのみ担う（Node.js API 直接使用不可）
- 対象プラットフォーム: Windows 10/11 64-bit のみ

## 設計ドキュメント

`docs/basic_design.md` に詳細設計書（機能要件・IPC プロトコル・ファイル処理ロジック・セキュリティ設計・エラーハンドリング）がある。
