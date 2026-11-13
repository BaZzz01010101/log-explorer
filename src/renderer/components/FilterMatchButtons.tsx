import { ActionIcon } from "@mantine/core";
import { Tooltip } from "./AppTooltip";

export function FilterMatchButtons({
  scope,
  caseSensitive,
  regex,
  caseShortcut,
  regexShortcut,
  onCaseChange,
  onRegexChange,
}: {
  scope: "highlight" | "local filter" | "explorer";
  caseSensitive: boolean;
  regex: boolean;
  caseShortcut: string;
  regexShortcut: string;
  onCaseChange(): void;
  onRegexChange(): void;
}) {
  return (
    <>
      <Tooltip label={`Match case (${caseShortcut || "unassigned"})`}>
        <ActionIcon
          size={22}
          variant={caseSensitive ? "light" : "subtle"}
          aria-label={scope === "explorer" ? "Match case" : `Match ${scope} case`}
          aria-pressed={caseSensitive}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCaseChange}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Aa</span>
        </ActionIcon>
      </Tooltip>
      <Tooltip
        label={`Use regular expression (${regexShortcut || "unassigned"})`}
      >
        <ActionIcon
          size={22}
          variant={regex ? "light" : "subtle"}
          aria-label={scope === "explorer" ? "Use regular expression" : `Use ${scope} regular expression`}
          aria-pressed={regex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRegexChange}
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx={6} cy={18} r={2} fill="currentColor" stroke="none" />
            <path d="M17 4v8m-3.5-6 7 4m-7 0 7-4" />
          </svg>
        </ActionIcon>
      </Tooltip>
    </>
  );
}
