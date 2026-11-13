import { resolveFilterSyntax, type ServerFilterMode } from "./server-filter";
import { compileUnifiedFilter } from "./unified-filter";

export function gcpServerFilterMode(
  value: string,
  mode: ServerFilterMode = "auto",
): "plain" | "pattern" {
  if (mode !== "auto") return mode === "plain" ? "plain" : "pattern";
  const expression =
    /(?:^|\s|\()(?:resource|jsonPayload|protoPayload|textPayload|labels|severity|logName|timestamp|insertId|trace|httpRequest)(?:\.[\w".-]+)*\s*(?:=~|!~|!=|>=|<=|=|>|<|:)/i.test(
      value,
    );
  return expression ? "pattern" : "plain";
}

export function compileGcpServerFilter(
  value: string,
  mode: ServerFilterMode = "auto",
  logType: "all" | "audit" | "execution" = "all",
): string {
  const text = value.trim();
  const user = !text
    ? ""
    : gcpServerFilterMode(text, mode) === "pattern"
      ? text
      : JSON.stringify(text);
  const audit =
    'protoPayload."@type"="type.googleapis.com/google.cloud.audit.AuditLog"';
  const type =
    logType === "audit" ? audit : logType === "execution" ? `NOT ${audit}` : "";
  return user && type ? `(${user}) AND (${type})` : user || type;
}

export function compileGcpViewFilter(
  value: string,
  mode: ServerFilterMode | undefined,
  logType: "all" | "audit" | "execution" | undefined,
  mixed: boolean,
): { pattern: string; local?: { kind: "plain" | "aws-json"; value: string } } {
  logType = "execution";
  const syntax = resolveFilterSyntax(value, mode, mixed ? "aws" : "gcp");
  if (!value.trim())
    return { pattern: compileGcpServerFilter("", "plain", logType) };
  if (syntax === "aws")
    throw new Error(
      "AWS Pattern is not available for views containing GCP sources. Use Unified or Text.",
    );
  if (syntax === "gcp" && mixed)
    throw new Error(
      "GCP Pattern is not available for views containing AWS sources. Use Unified or Text.",
    );
  const expression =
    syntax === "unified" ? compileUnifiedFilter(value, "gcp") : value;
  return {
    pattern: compileGcpServerFilter(
      expression,
      syntax === "plain" ? "plain" : "pattern",
      logType,
    ),
  };
}
