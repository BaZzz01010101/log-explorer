# Filter highlights and surrounding context

Version 0.1.34 moves AWS/local overview marks into the inspector message, keeps quick/profile highlights on the main list, and adds per-view metadata folding. See [inspector scrolling notes](inspector-scroll-0.1.34.md).

## Behavior

- AWS matches use blue, local-filter matches green, and the existing quick text highlight yellow. Overlaps retain each color. Profile colors remain available. Matching text is unchanged for selection, copying and export.
- AWS highlighting uses the executed request, so editing a draft does not recolor previously loaded results. Local highlighting follows the applied loaded-event filter.
- Supported queries are evaluated as expressions before evidence is collected. Only satisfied branches contribute evidence; structured matches retain their actual JSON Pointer and raw-source offsets. Identical values in unrelated properties are not highlighted.
- Supported AWS evidence includes literal terms/phrases, the validated AWS percent-regex subset, grouped JSON conjunction/disjunction, scalar comparisons, wildcard strings/selectors, quoted keys, array indices, `NOT EXISTS`, and `IS NULL/TRUE/FALSE`. Local evidence shares the existing local-filter parser for terms, phrases, pointer existence and equality.
- Unsupported AWS constructs (including space-delimited bracket patterns) and bounded-out inputs receive no guessed server highlights. Queries still execute normally against AWS. Highlight work runs in the existing deadline-controlled worker; input, span, result and cache limits remain enforced. Messages above 200,000 characters omit filter evidence because a truncated source cannot establish whole-query semantics.
- Folded inspector branches show small colored dots for matches below them. Preferences includes **Automatically expand inspector paths to highlighted matches**, enabled by default. It opens matching ancestors, leaves unrelated branches folded, and respects manual folding until a match configuration changes.
- Right-click an event for **Surrounding context → Previous logs / Next logs / Before and after → 1 second / 5 seconds / 10 seconds / 30 seconds / 1 minute / 5 minutes**. A new view queries the clicked event's exact source and millisecond window with clear filters. Previous-only windows include the anchor despite AWS's exclusive end time. Missing source/stream metadata disables the action.
- New tables use Timestamp, Level and Message. `/service/name` and `/request/id` were fixture-specific JSON pointers, not universal CloudWatch fields. Only the exact untouched old default layout is migrated; customized columns remain intact and either pointer can still be added explicitly.

## Verification

Evidence and hidden native captures are stored under `.tmp`. The unit suite covers parsing/evidence, scoped source offsets, escaping, key collisions, packed worker results, stale sessions, source completeness, inspector folding, preference/default migration and precise context ranges. Desktop tests use isolated offline storage and hidden windows; they never enable AWS or alter the normal running application.

Independent review identified and corrected unnecessary overview evidence retention and false anchored-regex evidence at a truncation boundary. Both have regression checks. Real AWS interoperability, installer installation and signing are outside this verification.

All 801 unit/integration tests and 47 distinct targeted hidden packaged desktop cases passed. The final cache metadata accounting correction has a red/green regression and 17 affected native checks rerun against the final package; unchanged context/geometry behavior retains the broader candidate coverage. All 18 direction/duration context choices were traversed with trusted UI input and checked against exact requests. Native testing also reproduced and corrected tooltip interference with submenu traversal. Raw reports, manifests, captures, review evidence and the explicit coverage aggregate are linked from `.tmp/final-verification-0.1.33.json`.
