# Unfolded and wrapped event layouts

Hybrid detail footers no longer contain Fold message, Open inspector or Copy raw. JSON cards no longer contain Inspect or the raw-copy icon. Row gestures, gutters, the main inspector toggle, context-menu copying and detail resizing remain available.

The timestamp default is 260 px. Restoring the old 194 px automatic default upgrades it; custom widths and explicit formats are retained. The fallback columns and resize-to-default action share the same width.

Wrapped JSON field names keep their intrinsic width while values use the remaining space. Extremely long names can ellipsize instead of breaking into vertical fragments. Wrapped values retain arbitrary-word breaking and multiline content.

## Root causes

Global layout changes previously cleared the virtualizer's measured heights, then called its normal element measurement. That method can skip measurement while scrolling. Rows whose DOM height did not change received no new ResizeObserver notification, leaving the estimate in place indefinitely. The baseline reproduced approximately 224 px gaps in Table mode and 111 px gaps / 114 px overlaps in JSON mode.

`useMeasuredVirtualRows` owns one ResizeObserver and publishes natural fractional row heights through the supported `resizeItem` API. It remeasures mounted rows before paint, including unchanged rows after cache invalidation. It does not also attach the virtualizer's built-in measurement observer. React 19 batches these layout updates without lifecycle `flushSync` calls. Individual expansions retain other rows' measured heights.

Hybrid bulk unfolding previously opened detail panes but left their JSON branch state untouched. It now recursively unfolds current, future and recycled rows. Explicit branch changes remain until the next bulk command. Normal single-row expansion and Ctrl-unfold retain their distinct behavior, including auto-fit and manually resized heights.

## Verification

- `.tmp/test-results-0.1.74-red/report.json`: all 11 original scenarios fail against 0.1.73, including both themes and all three modes.
- `.tmp/unit-074-timestamp-red.json`: the timestamp migration fails before correction.
- `.tmp/unit-0.1.74-final.json`: full unit suite.
- `.tmp/desktop-verification-0.1.74.json`: final packaged regression evidence and artifact manifest.

Desktop coverage includes bidirectional continuous scrolling, column/window resizing, wrapping and unfolding transitions, complete nested branches, default timestamp clipping, removed actions, independent detail heights and scroll areas, Ctrl-unfold, retained tab DOM and scroll offsets, Live text selection, fast highlight scrolling, row selection and copying. Hidden captures drive compositor frames without displaying or focusing windows. An independent read-only code review found no substantive issues.

Structured inspection retains its existing node/depth bounds. Verification uses isolated offline fixtures; real AWS and installer installation are not exercised. The release uses the existing hash-checked natural-exit handoff and retained backup.
