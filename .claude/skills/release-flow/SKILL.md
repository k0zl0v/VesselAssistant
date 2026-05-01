---
name: release-flow
description: Use when bumping the project version, tagging a release, working on .github/workflows/release.yml, src-tauri/tauri.conf.json bundle config, or distributing built binaries. Triggers on edits to package.json (version field), src-tauri/Cargo.toml, src-tauri/tauri.conf.json, or .github/workflows/**.
---

# Release flow

Production releases are produced by GitHub Actions on tag push. The workflow at `.github/workflows/release.yml` runs `tauri build` on **macOS arm64** (`macos-14`) and **Windows x64** (`windows-latest`) in parallel, attaching all bundles to a draft GitHub Release.

## Versions live in three files — keep them aligned

| File | Field |
|---|---|
| `package.json` | `"version": "X.Y.Z"` |
| `src-tauri/Cargo.toml` | `version = "X.Y.Z"` (under `[package]`) |
| `src-tauri/tauri.conf.json` | `"version": "X.Y.Z"` |

Bump them together. Mismatch isn't fatal but produces confusing artifact filenames (Tauri uses tauri.conf.json's version for the `.dmg`/`.msi` filename, package.json drives `npm version`-aware tooling, Cargo.toml feeds `Cargo.lock`).

## Tag format — strictly `vX.Y.Z`

The workflow trigger filter is:

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```

A tag named `0.1.0` (no `v`) **silently does nothing** — there's no warning in the GitHub UI; Actions just stays empty. This was a real incident (commit `884599f` and tag-rename rescue). Always:

```bash
git tag v0.1.0
git push origin v0.1.0
```

If you accidentally pushed a tag without `v`:

```bash
git tag v0.1.0 0.1.0           # create v-prefixed on same commit
git push origin v0.1.0          # this triggers the workflow
git tag -d 0.1.0                # delete locally
git push origin :refs/tags/0.1.0  # delete on remote
```

## Full release procedure

```bash
# 1. Bump versions in 3 files.
# 2. Update CHANGELOG / release notes (if you keep one).
# 3. Commit and tag:
git commit -am "chore: bump to v0.1.1"
git tag v0.1.1
git push origin main --tags

# 4. Watch https://github.com/k0zl0v/VesselAssistant/actions
#    Two parallel jobs (macOS arm64, Windows x64). ~6-12 min each.

# 5. After both succeed, https://github.com/k0zl0v/VesselAssistant/releases
#    has a DRAFT release named "VesselAssistant v0.1.1". Edit → Publish.
```

## What the workflow produces

| Platform | Files |
|---|---|
| macOS arm64 (`macos-14`) | `VesselAssistant_X.Y.Z_aarch64.dmg`, `VesselAssistant_X.Y.Z_aarch64.app.tar.gz` |
| Windows x64 (`windows-latest`) | `VesselAssistant_X.Y.Z_x64-setup.exe` (NSIS, per-user install), `VesselAssistant_X.Y.Z_x64_en-US.msi` (Windows Installer) |

`.app.tar.gz` is for future auto-update (Tauri updater consumes the signed .sig). Currently no signing — the .sig lives but isn't checked.

## Codesigning — currently OFF

Both macOS and Windows binaries are **unsigned**. Distribution implications:

- **macOS:** Gatekeeper prompts "unidentified developer" on first run. User does right-click → Open OR `xattr -dr com.apple.quarantine /Applications/VesselAssistant.app`. To fix properly: $99/year Apple Developer ID, set `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` GitHub secrets and run `tauri-apps/tauri-action` with `includeRelease: true`.
- **Windows:** SmartScreen warns "Windows protected your PC". Click "More info" → "Run anyway". Authenticode signing requires a code-signing cert (~$100-400/year).

For internal/personal distribution, unsigned is fine. For wider distribution, sign both.

## Cross-compilation: NOT possible from macOS to Windows

Tauri uses platform-native bundlers:
- macOS: `bundle_dmg.sh` + `codesign`
- Windows: WiX 3 (.msi) + NSIS (.exe)

These don't run on macOS. The only realistic path to a Windows build is:
1. **GitHub Actions** (current setup — recommended).
2. A Windows VM on Mac (UTM + Win 11 ARM, ~10 GB) running `npm run tauri build`.
3. A real Windows machine.

## Local build for development

`npm run tauri build` on the developer's Mac produces `.app` + `.dmg` for the local platform only:

```
src-tauri/target/release/bundle/dmg/VesselAssistant_X.Y.Z_aarch64.dmg
src-tauri/target/release/bundle/macos/VesselAssistant.app
```

Useful for personal testing — just remember the user's Mac determines the architecture (Apple Silicon vs Intel).

## Manual workflow run

`workflow_dispatch` is enabled — go to **Actions → Release → Run workflow** in GitHub UI. This triggers a build but does NOT publish a release; artifacts appear in the workflow run's "Artifacts" section. Use this to smoke-test the workflow without bumping version.

## WebView2 on Windows

`src-tauri/tauri.conf.json` has:

```json
"bundle": {
  "windows": {
    "webviewInstallMode": {
      "type": "downloadBootstrapper",
      "silent": true
    }
  }
}
```

`downloadBootstrapper` keeps the .msi small (~7 MB) and downloads WebView2 at install time on machines that don't have it (older Windows 10 builds). Windows 11 ships WebView2 by default. Alternatives:
- `embedBootstrapper` — same bootstrapper but embedded, slightly larger installer, works offline.
- `offlineInstaller` — full WebView2 runtime embedded (~150 MB), works on totally offline machines.
- `skip` — assume present; will silently fail to start if not.

## Database migration on upgrade

When users install a newer .dmg/.msi over an older version, the SQLite DB at:
- macOS: `~/Library/Application Support/com.vesselassistant.app/vessel_assistant.db`
- Windows: `%LOCALAPPDATA%\com.vesselassistant.app\vessel_assistant.db`

is **preserved**. The .app/.exe replace touches only the application bundle, not user data.

`tauri-plugin-sql` runs migrations idempotently: it checks `_sqlx_migrations` table and applies anything missing. Adding a new migration is safe — existing data is preserved unless the migration explicitly drops/alters columns.

⚠ Encourage users to **Tools → Backup & restore → Export backup** before any major upgrade. JSON envelope is portable and trivially restorable via Import.

## Common pitfalls

- **Tag without `v` prefix** — workflow doesn't trigger. Re-tag with `v` and force-delete the old.
- **Forgetting to bump all three version files** — produces artifacts named `0.1.0` while UI shows `0.1.1`.
- **Pushing main without `--tags`** — main lands on GitHub but tag stays local. The workflow runs on tag push, not commit push to main.
- **Editing the workflow file then trying `workflow_dispatch` from main** — workflow_dispatch always uses the version on the chosen ref. If you need to test changes, push to a branch and run dispatch from that branch.
- **Codesigning failure half-blocking the workflow** — currently we don't sign so this is moot, but if you add signing secrets and they're wrong, builds fail with cryptic errors. Always test secrets via `workflow_dispatch` first, not via tag push.
- **Cargo.lock changes** in PR — don't ignore them. Lock changes when dependencies updated; reviewing the diff catches accidental version bumps.
