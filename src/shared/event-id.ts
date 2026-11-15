/**
 * The only place event IDs are minted for the renderer: the owning connection
 * plus the provider-native ID. An event therefore keeps the same ID in
 * single-source, multi-source and live queries.
 */
export function scopedEventId(connectionId: string, nativeId: string): string {
  return JSON.stringify([connectionId, nativeId]);
}
