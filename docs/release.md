# Building and releasing

## Local build

Use Node.js 24 and the included npm lockfile:

```sh
npm ci
npx install-electron --no
npm run typecheck
npm test
npm run build
npm run test:desktop
npm run package
```

`install-electron` downloads the Electron runtime on demand; use it when the binary is missing. The [official installation guide](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md) documents this command.

`build` writes main/preload/renderer bundles to `out/`. `package` builds an unpacked host-platform application under `release/`. `npm run dist` builds the configured distributable: Windows NSIS installer, macOS DMG or Linux AppImage. Configuration is in `electron-builder.yml`. Packaging can download Electron or builder tools; it does not require AWS access.

## Release requirements

- **Windows:** build and test on Windows, configure Authenticode signing and validate installation/uninstallation, user-selected paths, shortcuts and upgrades. The checked-in NSIS configuration supports an installation-directory choice. Signing credentials and a signed release are not supplied.
- **macOS:** use a macOS release environment, Apple signing credentials and notarization; validate Intel/Apple Silicon targets, window lifecycle and installation. This Windows development session does not verify macOS artifacts.
- **Linux:** build and test the AppImage in a Linux release environment; check sandbox support, desktop integration and supported distributions. Linux artifacts are not verified by Windows tests.

Keep signing secrets outside the repository and workspace files. Signing/notarization is part of the release pipeline; see [Electron code-signing guidance](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md). Automatic updates, a release feed and update signing are not configured.

Before publishing, record artifact paths, hashes, test results and platform versions in [feature status](feature-status.md). Verify persistence across restart, close-time saves, recovery, keyboard navigation, accessible controls and representative large datasets. All checks in this development task must remain offline. Real AWS verification requires the user's separate, specific authorization; neither packaging nor tool approval grants it.

## Windows development sandbox troubleshooting

This managed Windows environment can apply directory ACLs that prevent Electron's sandboxed processes from reading a checkout or runtime files, producing startup/spawn failures. This is an environment-specific issue, not a reason to disable the application's Chromium sandbox. Check the failing paths and inherited permissions, then use an approved readable development location or narrowly correct the affected ACLs. Avoid blanket permission changes and `--no-sandbox` as a release workaround.

Keep the preload sandbox and context isolation enabled. Missing-runtime errors should first be addressed with `npx install-electron --no`, separately from filesystem-permission failures. The desktop test harness provides temporary application storage and an isolated environment; it must never enable AWS access.

## Data and rollback

For packaged verification, launch `AWS Log Explorer.exe --offline-verification`. This flag hard-disables AWS access even if the UI or a restored workspace requests it. Automated tests additionally pass `--background-verification`, which keeps the window hidden, disables background throttling and also hard-disables AWS. Chromium focus emulation lets trusted mouse and keyboard input exercise the real renderer without taking desktop focus. The suite uses actual pointer drags rather than DOM click dispatch. Physical OS input, screen-reader behavior and installer installation/uninstallation remain separate release checks. See the [renderer freeze investigation](renderer-freeze-investigation.md) for the defect missed by the original synthetic-input tests.

Workspace configuration lives in Electron's per-user application-data directory as `workspace.json`, with a previous-file backup. Log payloads are kept in memory and exported only through an explicit local save dialog. Back up configuration before distributing an incompatible workspace migration. Preserve the original file and surface recovery warnings when loading fails.

The current implementation is version `0.1.1`. The release configuration and offline tests provide a starting point for distribution; they do not establish a signed, security-audited or commercially validated production release.
