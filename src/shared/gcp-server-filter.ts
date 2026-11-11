import type { ServerFilterMode } from "./server-filter";

export function gcpServerFilterMode(value: string, mode: ServerFilterMode = "auto"): "plain" | "pattern" {
  if (mode !== "auto") return mode;
  const expression = /(?:^|\s|\()(?:resource|jsonPayload|protoPayload|textPayload|labels|severity|logName|timestamp|insertId|trace|httpRequest)(?:\.[\w".-]+)*\s*(?:=~|!~|!=|>=|<=|=|>|<|:)/i.test(value);
  return expression ? "pattern" : "plain";
}

export function compileGcpServerFilter(value: string, mode: ServerFilterMode = "auto", logType: "all" | "audit" | "execution" = "all"): string {
  const text = value.trim();
  const user = !text ? "" : gcpServerFilterMode(text, mode) === "pattern" ? text : JSON.stringify(text);
  const audit = 'protoPayload."@type"="type.googleapis.com/google.cloud.audit.AuditLog"';
  const type = logType === "audit" ? audit : logType === "execution" ? `NOT ${audit}` : "";
  return user && type ? `(${user}) AND (${type})` : user || type;
}
