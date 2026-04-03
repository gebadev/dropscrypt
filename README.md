# DropSCrypt

## Overview

An Electron app for Windows that lets you encrypt and decrypt files via drag & drop using AES-256 symmetric encryption powered by GnuPG (`gpg.exe`).

> **Note:** This app is intended for learning purposes only. Do not use it for serious security needs.

## Requirements

- Windows 10 / 11 (64-bit)
- [GnuPG](https://www.gnupg.org/) (`gpg.exe`) installed and available on the `PATH`

## Usage

1. Launch the app
2. Enter a passphrase
3. Drag and drop files or a folder onto the drop area
4. Select **Encrypt** or **Decrypt** and run

- **Encrypt:** Saves the encrypted file with a `.gpg` extension in the same folder
- **Decrypt:** Restores the original file from the `.gpg` file in the same folder

## Development

```bash
npm install
npm start      # Start in development mode
npm run dist   # Build Windows installer to dist/
```
