export function queryPageLimit(modes: ReadonlySet<string | undefined>, maxEvents: number): number {
  return Math.min(modes.has("gcp") ? 2000 : 10000, maxEvents);
}
