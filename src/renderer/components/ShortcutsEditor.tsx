import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  SHORTCUT_SCOPE_LABELS,
  findShortcutConflicts,
  validateShortcut,
} from "../shortcut-definitions";
import {
  normalizeShortcut,
  shortcutFromKeyboardEvent,
  shortcutKeys,
} from "../shortcuts";
import "./shortcuts-editor.css";

function KeyBadges({ shortcut }: { shortcut: string }) {
  const keys = shortcutKeys(shortcut);
  return keys.length ? (
    <span className="shortcut-editor-keys" aria-hidden="true">
      {keys.map((key, index) => (
        <kbd key={index}>{key}</kbd>
      ))}
    </span>
  ) : (
    <span className="shortcut-editor-disabled">Disabled</span>
  );
}

export function ShortcutsEditor({
  shortcuts,
  onChange,
}: {
  shortcuts: Record<string, string>;
  onChange(next: Record<string, string>): void;
}) {
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const recordButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const captured = useRef(false);
  const capturedKey = useRef<string | null>(null);
  const cancel = (restoreFocus = true) => {
    if (restoreFocus && recording) recordButtons.current[recording]?.focus();
    setRecording(null);
    setCapturing(false);
    setDraft(null);
  };

  useEffect(() => {
    if (!recording || !capturing) return;
    recordButtons.current[recording]?.focus();
    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const keydown = (event: KeyboardEvent) => {
      consume(event);
      if (
        event.key === "Escape" &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        setRecording(null);
        setCapturing(false);
        setDraft(null);
        recordButtons.current[recording]?.focus();
        return;
      }
      const next = shortcutFromKeyboardEvent(event);
      if (next) {
        setDraft(next);
        captured.current = true;
        capturedKey.current = event.code || event.key.toLowerCase();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      consume(event);
      if ((event.code || event.key.toLowerCase()) === capturedKey.current)
        capturedKey.current = null;
      if (
        captured.current &&
        !capturedKey.current &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      )
        setCapturing(false);
    };
    const blur = () => {
      setRecording(null);
      setCapturing(false);
      setDraft(null);
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
    };
  }, [recording, capturing]);

  const filter = search.trim().toLocaleLowerCase();
  const commands = SHORTCUT_DEFINITIONS.filter((item) =>
    `${item.label} ${SHORTCUT_SCOPE_LABELS[item.scope]} ${shortcutKeys(shortcuts[item.id] ?? item.defaultShortcut).join(" ")}`
      .toLocaleLowerCase()
      .includes(filter),
  );
  const draftError =
    recording && draft ? validateShortcut(recording, draft, shortcuts) : null;
  const conflicts =
    recording && draft
      ? findShortcutConflicts(recording, draft, shortcuts)
      : [];
  const withoutConflicts = {
    ...shortcuts,
    ...Object.fromEntries(conflicts.map((item) => [item.id, ""])),
  };
  const canReplace =
    recording &&
    draft &&
    conflicts.length > 0 &&
    !validateShortcut(recording, draft, withoutConflicts);
  const save = (replace = false) => {
    if (!recording || !draft || (replace ? !canReplace : draftError)) return;
    onChange({
      ...(replace ? withoutConflicts : shortcuts),
      [recording]: draft,
    });
    cancel();
  };

  return (
    <div
      className="shortcut-editor"
      data-shortcut-editor
      data-shortcut-recording={recording && capturing ? "true" : undefined}
      onBlurCapture={(event) => {
        if (
          capturing &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        )
          cancel(false);
      }}
      onKeyDownCapture={(event) => {
        if (recording && !capturing && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <div className="shortcut-editor-toolbar">
        <input
          type="search"
          aria-label="Search commands"
          placeholder="Search commands"
          value={search}
          disabled={!!recording}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {!confirmReset ? (
          <button
            type="button"
            className="shortcut-editor-button"
            aria-label="Reset all shortcuts"
            disabled={!!recording}
            onClick={() => {
              setNotice(null);
              setConfirmReset(true);
            }}
          >
            Reset all
          </button>
        ) : null}
      </div>
      {confirmReset ? (
        <div
          className="shortcut-editor-confirm"
          role="group"
          aria-label="Reset all shortcuts confirmation"
        >
          <span>
            Restore all default shortcuts, including disabled commands?
          </span>
          <button
            type="button"
            className="shortcut-editor-button primary"
            aria-label="Confirm reset all shortcuts"
            onClick={() => {
              onChange({ ...shortcuts, ...DEFAULT_SHORTCUTS });
              setConfirmReset(false);
            }}
          >
            Reset all
          </button>
          <button
            type="button"
            className="shortcut-editor-button"
            aria-label="Cancel reset all shortcuts"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      <ul className="shortcut-editor-list" aria-label="Keyboard shortcuts">
        {commands.map((item) => {
          const value = shortcuts[item.id] ?? item.defaultShortcut;
          const active = recording === item.id;
          const error = active
            ? draftError
            : notice?.id === item.id
              ? notice.text
              : null;
          const currentError =
            !active && value
              ? validateShortcut(item.id, value, shortcuts)
              : null;
          return (
            <li
              className={`shortcut-editor-row${active ? " recording" : ""}`}
              key={item.id}
              data-shortcut-action={item.id}
            >
              <div className="shortcut-editor-command">
                <span>{item.label}</span>
                <small>{SHORTCUT_SCOPE_LABELS[item.scope]}</small>
              </div>
              <div className="shortcut-editor-controls">
                <button
                  type="button"
                  className="shortcut-editor-binding"
                  aria-label={`Edit shortcut for ${item.label}`}
                  aria-description={
                    active && !draft
                      ? "Press a shortcut"
                      : shortcutKeys(active ? draft! : value).join(" + ") ||
                        "Disabled"
                  }
                  aria-pressed={active && capturing}
                  disabled={!!recording && !active}
                  ref={(element) => {
                    recordButtons.current[item.id] = element;
                  }}
                  onClick={() => {
                    setRecording(item.id);
                    setCapturing(true);
                    captured.current = false;
                    capturedKey.current = null;
                    setDraft(null);
                    setNotice(null);
                    setConfirmReset(false);
                  }}
                >
                  {active && !draft ? (
                    <span>Press shortcut…</span>
                  ) : (
                    <KeyBadges shortcut={active ? draft! : value} />
                  )}
                  <span className="shortcut-editor-record-label">
                    {active
                      ? capturing
                        ? "Recording"
                        : "Record again"
                      : value
                        ? "Change"
                        : "Record"}
                  </span>
                </button>
                {!active ? (
                  <>
                    <button
                      type="button"
                      className="shortcut-editor-button"
                      aria-label={`Clear shortcut for ${item.label}`}
                      disabled={!value || !!recording}
                      onClick={() => {
                        onChange({ ...shortcuts, [item.id]: "" });
                        setNotice(null);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="shortcut-editor-button"
                      aria-label={`Reset shortcut for ${item.label}`}
                      disabled={
                        normalizeShortcut(value) === item.defaultShortcut ||
                        !!recording
                      }
                      onClick={() => {
                        const error = validateShortcut(
                          item.id,
                          item.defaultShortcut,
                          shortcuts,
                        );
                        if (error) {
                          setNotice({
                            id: item.id,
                            text: `${error} Change or clear that command first, or reset all shortcuts.`,
                          });
                          return;
                        }
                        onChange({
                          ...shortcuts,
                          [item.id]: item.defaultShortcut,
                        });
                        setNotice(null);
                      }}
                    >
                      Reset
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="shortcut-editor-button primary"
                      aria-label={`Save shortcut for ${item.label}`}
                      disabled={!draft || !!draftError}
                      onClick={() => save()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="shortcut-editor-button"
                      aria-label={`Cancel shortcut for ${item.label}`}
                      onClick={() => cancel()}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {active ? (
                <div className="shortcut-editor-hint" role="status">
                  {capturing
                    ? draft
                      ? "Release all keys to finish recording, then Save. Escape cancels."
                      : "Press a key combination. Escape cancels; Tab is recorded as a key."
                    : "Choose Save, Record again or Cancel. Escape cancels."}
                </div>
              ) : null}
              {error ? (
                <div className="shortcut-editor-error" role="alert">
                  {error}
                </div>
              ) : currentError ? (
                <div className="shortcut-editor-error" role="status">
                  {currentError} Change or clear this shortcut.
                </div>
              ) : null}
              {active && canReplace ? (
                <div className="shortcut-editor-resolution">
                  <span>
                    Using this shortcut will disable{" "}
                    {conflicts.map((conflict) => conflict.label).join(", ")}.
                  </span>
                  <button
                    type="button"
                    className="shortcut-editor-button"
                    aria-label={`Replace conflicting shortcuts for ${item.label}`}
                    onClick={() => save(true)}
                  >
                    Use shortcut and clear conflicts
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!commands.length ? (
        <p className="shortcut-editor-empty">No matching commands.</p>
      ) : null}
    </div>
  );
}
