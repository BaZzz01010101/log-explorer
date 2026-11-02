# Settings and sidebar simplification implementation plan

> **For agentic workers:** Use superpowers:executing-plans for integration; independent shortcut, connection-picker and source-details changes may run in parallel under superpowers:dispatching-parallel-agents.

**Goal:** Apply the user's settings cleanup, real shortcut editing, source-panel sizing and saved-search confirmation requirements.

**Architecture:** Retain automatic persisted application state, the current tree highlight editor, the existing scoped shortcut dispatcher, and themed overlays. Remove the obsolete settings pages and timed historical refresh rather than hiding their controls. Introduce focused reusable help and confirmation controls where behavior is shared.

**Tech stack:** Existing TypeScript, React, Mantine, Electron, Vitest and hidden Playwright desktop harness. No new dependencies.

**Spec:** The user's current detailed request and screenshot in this chat are the approved implementation scope. The implementation choices below are the agent's decisions.

## Global constraints

- Preserve existing unsaved repository changes; no commits or resets.
- Keep the user's app running without focusing it. Tests remain hidden, isolated and offline; results belong in `.tmp`.
- Remove user-facing workspace naming/import/export controls; retain internal state restoration and automatic persistence, which existing tabs/settings require.
- Preserve Live Tail, manual Run, source/date refresh and paging while removing periodic historical refresh.
- Test and stage one versioned package; promote only after natural app exit, retaining a backup and checking hashes.

## Review focus

- Shortcut recording must consume key presses before global/native actions, respect field scopes, handle literal plus and prevent ambiguous conflicts.
- Source details must retain its chosen height across empty/group/stream changes and remain usable in short sidebars.
- Saved-search confirmation must persist after outside clicks/menu reopening and must not run/delete a query until explicitly chosen.
- Existing configuration must restore safely after removed refresh fields and settings categories disappear.
- Connection pickers must remain enabled with no results, support keyboard choice, focus their filter and preserve removed-but-saved connections.

## Task 1: Keyboard shortcut editor

**Files:** `src/renderer/shortcuts.ts`, new `src/renderer/shortcut-definitions.ts`, new `src/renderer/components/ShortcutsEditor.tsx` and CSS; shortcut tests.

**Interfaces:** `ShortcutsEditor({ shortcuts: Record<string,string>, onChange(next): void })`; registry exports action labels/defaults/scopes and validation helpers. Keep `shortcutMatches(event, shortcut)` and `shortcutKeys(shortcut)` compatible. Root integrates the component and default map, and protects capture in `App.tsx`.

- [x] Add tests for recording/normalization, plus/navigation keys, modifier-only/repeat/IME handling, scoped conflicts and clear/reset behavior.
- [x] Implement searchable command rows, compact key badges, record/replace mode, explicit conflict feedback, clear, per-command reset and reset all.
- [x] Verify tests and formatting; integrate capture suppression before native/global shortcuts and persistence.

## Task 2: Connection pickers

**Files:** `src/renderer/components/ProfileConnectionsEditor.tsx`, new picker/CSS as useful, connection editor tests. Root owns `Settings.tsx` access/fixture switches.

**Interfaces:** Keep current editor props and exported state initializer. Picker buttons are always enabled; opening focuses a filter; selecting adds immediately. Root supplies `SettingLabel({ label, help })` for labels with optional custom help.

- [x] Test filtered empty/populated lists, immediate addition, keyboard behavior and existing connection retention.
- [x] Replace selector-plus-confirm pairs with Add profile/Add region popup buttons; remove old fixture-region block and unnecessary persistent hints.
- [x] Keep configured cards responsive and concise; verify tests.

## Task 3: Source details sizing

**Files:** `SourceDetails.tsx`, `ExplorerSidebar.tsx`, `explorer.css`, related tests and focused new sizing helper if needed.

**Interfaces:** Existing source-details props remain compatible. The section owns a horizontal resize separator with pointer/keyboard/reset behavior and an explicit stable expanded height. Header says Group details or Stream details; empty state uses Source details. No resource-kind badge.

- [x] Test constant height when selection changes, resize bounds, collapse/expand, pointer cancellation and short sidebar behavior.
- [x] Add centered resize hit/hover areas, retain scrollable body, remove navigation-hint footer while preserving real status/errors.
- [x] Verify current source tracking, copy actions and keyboard tree navigation still work.

## Task 4: Settings consolidation and help

**Files:** `Settings.tsx`, `settings.css`, `RelativeTimeTemplatesEditor.tsx`, `HighlightItemDetails.tsx`, obsolete highlight editor files/tests, contracts/security/workspace/useLogJobs, settings/job tests.

- [x] Remove old Highlights page/editor and Workspace page/tools; use Highlights for the existing tree editor.
- [x] Put Enable AWS access and Offline fixtures switches together; remove access banner. Fixture switch updates offline connection visibility without deleting connections.
- [x] Reorder Preferences into appearance, tabs/history, log display/inspector, memory; name search retention Search history limit.
- [x] Replace meaningful field descriptions with label help icons, accessible by hover and click; remove obvious explanations. Cover JSON Pointer escaping, profile applicability and memory eviction.
- [x] Strengthen time-unit bracket contrast/thickness without changing its layout.
- [x] Remove refreshSeconds preference/schema/default/parser and periodic effect; migrate by ignoring old values. Test no timer-driven query with old stored data and preserved Live behavior.

## Task 5: Saved-search confirmation and window cleanup

**Files:** `QueryPane.tsx`, query CSS/tests; shared inline confirmation component/CSS if reused; `ViewFavorites.tsx`; `App.tsx`, `app.css`; desktop expectations.

- [x] Add the same persistent full-row Delete/Cancel behavior to saved searches, using compact real buttons and theme colors. Keep deletion separate from menu selection/query execution.
- [x] Remove the app's lowest information footer and obsolete CSS/state; keep event query status and error notifications.
- [x] Run typecheck and focused tests, then full unit suite, production build and relevant hidden desktop scenarios in both themes.
- [x] Package versioned update, verify artifacts and stage via natural-exit handoff; document actual final evidence and update state.

## Verification and handoff

- Version: 0.1.65. Unit suite: 1,110 passing. Targeted packaged desktop checks: 42 distinct passing, with explicit harness followups retained in the aggregate.
- Typecheck, production build and NSIS packaging pass. See `.tmp/desktop-verification-0.1.65.json` and `release/0.1.65/artifact-manifest.json`.
- Natural-exit handoff and eight exact-standard-path checks are queued. Current state is `.tmp/standard-build-update-0.1.65.json`; no user app was closed or relaunched.

- Handoff completed: standard launch folder is 0.1.65, hashes match, backup retained. All eight post-promotion hidden checks passed. Final proof: `.tmp/final-verification-0.1.65.json`.
