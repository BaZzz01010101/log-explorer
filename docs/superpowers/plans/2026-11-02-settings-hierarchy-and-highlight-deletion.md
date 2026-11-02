# Preferences hierarchy and inline highlight deletion

The user requests clearer visual grouping in Preferences while retaining one vertical flow, and Favorites-style delete buttons and inline confirmation in Highlights.

Use larger section headings above quiet grouped surfaces, with consistent inset option rows and thin separators. Keep labels above their full-width controls, centered within the existing maximum width, and preserve live editing and help behavior. Avoid extra columns, accordions and new navigation.

Reuse `InlineDeleteConfirmation` for profile/rule rows, with a hover/focus delete icon, whole-row destructive tint and right-aligned Delete/Cancel buttons. Context-menu and Delete-key actions enter the same confirmation. Confirmation stays attached to its item through selection and reorder until chosen; deleting a profile includes its rules. Keep existing automatic editing, tree drag behavior and neighbor selection after deletion. Remove the deletion modal.

- [x] Add deletion regressions and implement the shared row interaction.
- [x] Apply section/option hierarchy in both themes and pane/modal settings.
- [x] Run unit, typecheck/build and targeted hidden offline desktop checks, including narrow layouts, keyboard, pointer and deletion persistence.
- [x] Package a versioned release and stage it through the existing hash-checked natural-exit update workflow. Do not focus, close or relaunch the user's app. Keep evidence in `.tmp` and changes uncommitted.

Verification: 1,111 unit tests and 18 targeted hidden/offline packaged desktop checks pass; typecheck, production build and NSIS packaging pass. Evidence is `.tmp/desktop-verification-0.1.66.json`. The safe update is complete with a retained backup and matching hashes. All six post-promotion checks pass; final proof is `.tmp/final-verification-0.1.66.json`.
