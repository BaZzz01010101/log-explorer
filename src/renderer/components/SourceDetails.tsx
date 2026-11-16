import { useId, useState, type ReactNode } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFolder,
  IconList,
} from "@tabler/icons-react";
import type { Connection, LogGroup, LogStream } from "../../shared/contracts";
import { formatTimestamp } from "../timestamp-format";
import { useSourceDetailsSize } from "./source-details-size";

export type SourceDetailsResource = {
  connection: Connection;
  group: LogGroup;
} & ({ kind: "group" } | { kind: "stream"; stream: LogStream });

function storedSize(bytes: number | undefined) {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0)
    return "Not provided";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const unit = Math.min(
    units.length - 1,
    Math.max(0, bytes > 0 ? Math.floor(Math.log(bytes) / Math.log(1024)) : 0),
  );
  const size = (bytes / 1024 ** unit).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return `${size} ${units[unit]}${unit ? ` (${bytes.toLocaleString()} bytes)` : ""}`;
}

export function Field({
  label,
  children,
  value,
  onCopy,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  value?: string;
  wide?: boolean;
  onCopy?(value: string): void;
}) {
  return (
    <div
      className={`source-details-field${wide ? " source-details-field-wide" : ""}`}
    >
      <dt>{label}</dt>
      <dd>
        <span>{children}</span>
        {value && onCopy && (
          <button
            type="button"
            className="source-details-copy"
            aria-label={`Copy ${label}`}
            onClick={() => onCopy(value)}
          >
            <IconCopy size={13} aria-hidden="true" />
          </button>
        )}
      </dd>
    </div>
  );
}

export function SourceDetails({
  resource,
  onCopy,
  height,
  onHeightChange,
}: {
  resource?: SourceDetailsResource;
  onCopy(value: string): void;
  height?: number;
  onHeightChange?(height: number): void;
}) {
  const stream = resource?.kind === "stream" ? resource.stream : undefined;
  const group = resource?.group;
  const name = stream?.name ?? group?.name;
  const arn =
    group?.arn &&
    (stream
      ? group.arn.replace(/:\*$/, "") + ":log-stream:" + stream.name
      : group.arn);
  const lastEvent = stream?.lastEventTime;
  const lastEventTime =
    lastEvent !== undefined &&
    Number.isFinite(lastEvent) &&
    !Number.isNaN(new Date(lastEvent).getTime())
      ? formatTimestamp(lastEvent, "utc")
      : undefined;
  const logClass =
    group?.logClass === "STANDARD"
      ? "Standard"
      : group?.logClass === "INFREQUENT_ACCESS"
        ? "Infrequent access"
        : group?.logClass === "DELIVERY"
          ? "Delivery"
          : (group?.logClass ?? "Not provided");
  return (
    <SourceDetailsFrame
      title={resource ? (stream ? "Stream details" : "Group details") : "Source details"}
      emptyText="Choose a log group or stream to inspect its details."
      height={height}
      onHeightChange={onHeightChange}
    >
      {resource && group && name ? (
        <>
          <SourceDetailsName
            icon={stream ? <IconList size={14} aria-hidden="true" /> : <IconFolder size={14} aria-hidden="true" />}
            name={name}
            onCopy={onCopy}
          />
          <dl className="source-details-identity">
            {stream && (
              <Field label="Log group" value={group.name} onCopy={onCopy}>
                {group.name}
              </Field>
            )}
            <Field label="ARN" value={arn} onCopy={onCopy} wide>
              {arn ?? "Not provided"}
            </Field>
            <Field label="Profile">{resource.connection.profile}</Field>
            <Field label="Region">{resource.connection.region}</Field>
            {resource.connection.mode === "offline" && (
              <Field label="Data">Offline fixtures</Field>
            )}
          </dl>
          {stream && (
            <dl className="source-details-metadata">
              <Field label="Last event">
                {lastEventTime ? (
                  <time dateTime={new Date(lastEvent!).toISOString()}>
                    {lastEventTime}
                  </time>
                ) : (
                  "Not provided"
                )}
              </Field>
            </dl>
          )}
          {stream && (
            <div className="source-details-subheading">Group settings</div>
          )}
          <dl className="source-details-metadata">
            <Field label="Retention">
              {group.retentionDays === undefined
                ? "Never expires"
                : `${group.retentionDays.toLocaleString()} days`}
            </Field>
            <Field label="Log class">{logClass}</Field>
            <Field label="Stored in group">{storedSize(group.storedBytes)}</Field>
          </dl>
        </>
      ) : null}
    </SourceDetailsFrame>
  );
}

/** The selected resource's name with its kind icon and a copy action. */
export function SourceDetailsName({
  icon,
  name,
  onCopy,
  copyLabel = "Copy source name",
}: {
  icon: ReactNode;
  name: string;
  onCopy(value: string): void;
  copyLabel?: string;
}) {
  return (
    <div className="source-details-name">
      {icon}
      <span>{name}</span>
      <button
        type="button"
        className="source-details-copy"
        aria-label={copyLabel}
        onClick={() => onCopy(name)}
      >
        <IconCopy size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Collapsible, resizable panel shared by the AWS and Google Cloud explorers;
 * children render the selected resource, or the empty text when there is none.
 */
export function SourceDetailsFrame({
  title,
  emptyText,
  height,
  onHeightChange,
  children,
}: {
  title: string;
  emptyText: string;
  height?: number;
  onHeightChange?(height: number): void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const sizing = useSourceDetailsSize({ height, onHeightChange, expanded });
  const bodyId = useId();
  return (
    <section
      className="source-details"
      aria-label="Current source details"
      ref={sizing.panel}
      style={{ height: sizing.height }}
    >
      {expanded && <div {...sizing.separatorProps} aria-controls={bodyId} />}
      <button
        type="button"
        className="source-details-heading"
        aria-label="Toggle source details"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => {
          sizing.cancel();
          setExpanded((previous) => !previous);
        }}
      >
        {expanded ? (
          <IconChevronDown size={13} aria-hidden="true" />
        ) : (
          <IconChevronRight size={13} aria-hidden="true" />
        )}
        <span>{title}</span>
      </button>
      {expanded && (
        <div className="source-details-body" id={bodyId}>
          {children ?? <p className="source-details-empty">{emptyText}</p>}
        </div>
      )}
    </section>
  );
}
