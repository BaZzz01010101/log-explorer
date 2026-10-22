import type { LayoutRect } from "../shared/layout-geometry";

interface HoverTab {
  id: string;
  rect: LayoutRect;
  clip?: LayoutRect;
}

/** A dwell target needs visible overlap, measured against the smaller tab. */
export function tabOverlapTarget(
  source: LayoutRect,
  tabs: HoverTab[],
  preferredId?: string,
): string | null {
  let best: { id: string; coverage: number; distance: number } | undefined;
  for (const { id, rect, clip } of tabs) {
    const width = Math.min(source.width, rect.width);
    const height = Math.min(source.height, rect.height);
    if (width <= 0 || height <= 0) continue;
    const overlap = Math.max(
      0,
      Math.min(
        source.left + source.width,
        rect.left + rect.width,
        clip ? clip.left + clip.width : Infinity,
      ) - Math.max(source.left, rect.left, clip?.left ?? -Infinity),
    );
    const vertical = Math.max(
      0,
      Math.min(
        source.top + source.height,
        rect.top + rect.height,
        clip ? clip.top + clip.height : Infinity,
      ) - Math.max(source.top, rect.top, clip?.top ?? -Infinity),
    );
    if (overlap + 1e-7 < width * 0.2 || vertical < height * 0.5) continue;
    const coverage = overlap / width;
    const distance = Math.abs(
      source.left + source.width / 2 - rect.left - rect.width / 2,
    );
    const tied = best && Math.abs(coverage - best.coverage) < 1e-7;
    if (
      !best ||
      coverage > best.coverage + 1e-7 ||
      (tied &&
        (id === preferredId ||
          (best.id !== preferredId && distance < best.distance)))
    )
      best = { id, coverage, distance };
  }
  return best?.id ?? null;
}
