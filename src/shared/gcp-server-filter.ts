import { serverFilterMode, type ServerFilterMode } from "./server-filter";
import { parseAwsCompatibleFilter } from "./aws-compatible-filter";

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

export function compileGcpViewFilter(value: string, mode: ServerFilterMode | undefined, logType: "all" | "audit" | "execution" | undefined, mixed: boolean): { pattern: string; local?: { kind: "plain" | "aws-json"; value: string } } {
  logType = "execution";
  if (!mixed) return { pattern: compileGcpServerFilter(value, mode, logType) };
  if (!value.trim()) return { pattern: compileGcpServerFilter("", "plain", logType) };
  if (serverFilterMode(value, mode) === "plain") return { pattern: compileGcpServerFilter(value, "plain", logType), local: { kind: "plain", value } };
  const predicate = parseAwsCompatibleFilter(value);
  const field = `jsonPayload.${predicate.path.map((part) => JSON.stringify(part)).join(".")}`;
  // Matching text/proto payloads can contain JSON too. Keep them in the
  // candidate set and verify every event locally with CloudWatch semantics.
  const candidate = predicate.operator === "NOT EXISTS" ? "" : `(textPayload:* OR protoPayload:* OR ${field}:*)`;
  const type = compileGcpServerFilter("", "plain", logType);
  return { pattern: candidate && type ? `${candidate} AND (${type})` : candidate || type, local: { kind: "aws-json", value } };
}
