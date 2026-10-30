# Favorite emphasis and tooltip visibility

- Use distinct theme-specific hover and pending-confirmation backgrounds across
  each complete favorite row. Keep confirmation highlighted after mouseleave.
- Present Delete and Cancel as compact buttons with borders/backgrounds; retain
  the existing persistent confirmation and action order.
- Normalize automatic single-source favorite/tab hints to their normal short
  label. Keep source/member information for renamed and multi-source views.
- Centralize tooltip redundancy checks for wrapped React tooltips and delegated
  data-tooltip hints. Suppress only repeated visible text that is fully readable;
  preserve truncated labels, descriptions, shortcuts and icon-only help.
- Assess actual text clipping, including child spans, ancestor overflow and
  fully visible wrapped text. Recheck at delayed open, avoiding stale popups.
- Validate user examples with real hidden/offline desktop geometry in both
  themes, plus current tooltip selection/exclusivity/history behavior. Package a
  verified update and use the existing natural-exit handoff.

Primary owns favorites/tab presentation and release; shared-tooltip worker owns
AppTooltip and visibility logic/tests; native worker owns screenshot/geometry
regressions and older native expectation updates.
