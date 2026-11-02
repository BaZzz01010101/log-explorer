import "./inline-delete-confirmation.css";

export function InlineDeleteConfirmation({
  label,
  onDelete,
  onCancel,
  className = "",
}: {
  label: string;
  onDelete(): void;
  onCancel(): void;
  className?: string;
}) {
  return (
    <div
      className={`inline-delete-confirmation ${className}`.trim()}
      role="group"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="inline-confirm-delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        Delete
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
      >
        Cancel
      </button>
    </div>
  );
}
