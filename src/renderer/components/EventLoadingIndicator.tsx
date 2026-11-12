import "./event-feedback.css";

interface Props {
  position: "empty" | "more" | "older";
}

export function EventLoadingIndicator({ position }: Props) {
  return (
    <div
      className={`event-loading event-loading-${position}`}
      role="status"
      aria-label="Loading events"
      data-loading-position={position}
    >
      <span className="event-loading-spinner" aria-hidden="true" />
    </div>
  );
}
