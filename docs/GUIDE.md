# JediNotebook guide

Everything the [README](../README.md) leaves out. Invariants for anyone changing the code are in [CLAUDE.md](../CLAUDE.md).

- [Running it locally](#running-it-locally)
- [Building the desktop and mobile apps](#building-the-desktop-and-mobile-apps)
- [Vault sync](#vault-sync)
- [Themes](#themes)
- [Project structure](#project-structure)

## Running it locally

```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

Typecheck, build, and test the same way, each from `client/`:

```bash
npx tsc --noEmit
npm run build         # client/dist/
npm run test          # vitest, one-shot: 363 tests across 28 files
npm run test:watch
npm run tauri:dev     # the desktop shell instead of the browser
npm run tauri:build
```

There's no root `package.json`. Every command above runs from `client/`.

## Building the desktop and mobile apps

```bash
./setup-android-build-tools.sh   # one-time: installs the Android SDK and NDK locally
./build-android.sh               # builds a universal debug APK, installs it over adb, launches it
./build-linux.sh                 # builds, installs into ~/.local, adds a .desktop entry
./build-macos.sh                 # builds the .app, copies it to /Applications, opens it
```

None of these only compile. Each one also installs what it built. Read a script before running it if that's not what you want.

## Vault sync

There's no server. Two installs stay in step only if they read and write the same folder on disk, an Obsidian-style vault of plain files. Something else has to replicate that folder between devices.

Syncthing can't merge a file it can't read as data. When two devices edit the same thing offline, JediNotebook resolves the conflict copy itself on the next import. Setup and the merge rules: [vault sync](vault-sync.md), [conflict resolution](vault-conflict-resolution.md).

## Themes

Thirteen, picked rather than generated. `light`. Two paper themes with an SVG wax-pencil texture, `wax-light` and `wax-dark`. Gruvbox, Everforest, Catppuccin, and Solarized, each light or dark. Nord and Dracula, dark only. A fully custom palette, built from any twelve colors. Set from Settings → Appearance. Hex values are in `client/src/theme/themes.ts`.

## Project structure

```
client/     the app: React 19, TypeScript 5.7, Vite 6, Tailwind 4, Zustand 5, Dexie 4, Motion, Recharts, React Router 7
            Tauri v2 wraps it for desktop and Android
shared/     types.ts and constants.ts, imported as @shared by client/
```

No `server/`. The pre-2026-07 Express and REST-sync stack was removed. Dexie, IndexedDB, is the only database now.
