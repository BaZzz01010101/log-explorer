export type InspectorMessageOrigin = "server" | "local" | "manual" | "profile";
export interface InspectorMessageMatch {
  origin: InspectorMessageOrigin;
  start: number;
  end: number;
  color: string;
  left?: number;
  right?: number;
}
export interface InspectorMessageMark {
  origin: InspectorMessageOrigin;
  top: number;
  height: number;
  colors: string[];
  contentStart: number;
  contentEnd: number;
}
export function buildInspectorMessageMarks(
  matches: readonly InspectorMessageMatch[],
  total: number,
  height: number,
): InspectorMessageMark[] {
  if (
    !(total > 0) ||
    !(height > 0) ||
    !Number.isFinite(total) ||
    !Number.isFinite(height)
  )
    return [];
  // Match the event overview's pixel buckets, with a cap for unusually tall windows.
  const count = Math.min(4096, Math.ceil(height));
  const pixelHeight = height / count;
  const lanes = new Map<
    InspectorMessageOrigin,
    (InspectorMessageMark | undefined)[]
  >();
  for (const match of matches) {
    if (
      !Number.isFinite(match.start) ||
      !Number.isFinite(match.end) ||
      match.end <= match.start ||
      match.end <= 0 ||
      match.start >= total
    )
      continue;
    let pixels = lanes.get(match.origin);
    if (!pixels) {
      pixels = Array(count);
      lanes.set(match.origin, pixels);
    }
    const top = Math.max(
      0,
      Math.min(count - 1, Math.floor((match.start / total) * count + 1e-9)),
    );
    const bottom = Math.min(
      count,
      Math.max(top + 1, Math.ceil((match.end / total) * count - 1e-9)),
    );
    for (let index = top; index < bottom; index++) {
      const existing = pixels[index];
      if (existing) {
        if (
          !existing.colors.includes(match.color) &&
          existing.colors.length < 4
        )
          existing.colors.push(match.color);
        existing.contentStart = Math.min(existing.contentStart, match.start);
        existing.contentEnd = Math.max(existing.contentEnd, match.end);
      } else
        pixels[index] = {
          origin: match.origin,
          top: index * pixelHeight,
          height: pixelHeight,
          colors: [match.color],
          contentStart: match.start,
          contentEnd: match.end,
        };
    }
  }
  const result: InspectorMessageMark[] = [];
  for (const origin of ["server", "local", "manual", "profile"] as const) {
    for (const mark of lanes.get(origin) ?? []) {
      if (!mark) continue;
      mark.colors.sort();
      const previous = result.at(-1);
      if (
        previous?.origin === origin &&
        Math.abs(previous.top + previous.height - mark.top) < 0.001 &&
        previous.colors.join("|") === mark.colors.join("|")
      ) {
        previous.height += mark.height;
        previous.contentStart = Math.min(
          previous.contentStart,
          mark.contentStart,
        );
        previous.contentEnd = Math.max(previous.contentEnd, mark.contentEnd);
      } else result.push({ ...mark });
    }
  }
  return result;
}
export function nearestInspectorMessageMatch(
  matches: readonly InspectorMessageMatch[],
  origin: InspectorMessageOrigin,
  y: number,
  total: number,
  height: number,
): InspectorMessageMatch | undefined {
  if (!(height > 0) || !(total > 0)) return;
  const position = (Math.max(0, Math.min(height, y)) / height) * total;
  let nearest: InspectorMessageMatch | undefined,
    distance = Infinity;
  for (const match of matches) {
    if (
      match.origin !== origin ||
      !Number.isFinite(match.start) ||
      !Number.isFinite(match.end) ||
      match.end <= match.start
    )
      continue;
    const next = Math.max(match.start - position, position - match.end, 0);
    if (next < distance) {
      nearest = match;
      distance = next;
    }
  }
  return nearest;
}
