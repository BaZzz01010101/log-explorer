export function formatTimestamp(
  timestamp: number,
  mode: "utc" | "local",
): string {
  const date = new Date(timestamp);
  if (mode === "utc")
    return date.toISOString().replace("T", " ").replace("Z", " UTC");
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  const offset = -date.getTimezoneOffset();
  const absoluteOffset = Math.abs(offset);
  const zone = `UTC${offset < 0 ? "-" : "+"}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)} ${zone}`;
}
