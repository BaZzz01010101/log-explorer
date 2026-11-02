import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button, Text } from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { Menu } from "./AppMenu";
import "./connection-add-picker.css";

interface AddChoice {
  value: string;
  label: string;
  description?: string;
}

export function ConnectionAddPicker({
  label,
  ariaLabel = label,
  searchLabel,
  placeholder,
  options,
  emptyMessage,
  noMatchesMessage,
  onSelect,
}: {
  label: string;
  ariaLabel?: string;
  searchLabel: string;
  placeholder: string;
  options: AddChoice[];
  emptyMessage: string;
  noMatchesMessage: string;
  onSelect(value: string): boolean;
}) {
  const id = useId();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const choicesRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const search = query.trim().toLocaleLowerCase();
  const choices = options.filter((option) =>
    `${option.value} ${option.label} ${option.description ?? ""}`
      .toLocaleLowerCase()
      .includes(search),
  );
  const active = Math.min(activeIndex, choices.length - 1);
  const changeOpened = (value: boolean) => {
    const restoreFocus =
      !value &&
      triggerRef.current &&
      typeof document !== "undefined" &&
      (dropdownRef.current?.contains(document.activeElement) ||
        document.activeElement === document.body);
    setOpened(value);
    if (restoreFocus)
      requestAnimationFrame(() => {
        // Do not take focus back from another field or a newly opened picker.
        if (
          document.activeElement === document.body ||
          dropdownRef.current?.contains(document.activeElement)
        )
          triggerRef.current?.focus();
      });
    if (value) {
      setQuery("");
      setActiveIndex(0);
    }
  };
  const select = (value: string) => {
    if (onSelect(value)) changeOpened(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      changeOpened(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (!choices.length) return;
      const next =
        (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) %
        choices.length;
      setActiveIndex(next);
      choicesRef.current
        ?.querySelectorAll<HTMLButtonElement>("[role=option]")
        [next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (choices[active]) select(choices[active].value);
    }
  };

  return (
    <Menu
      opened={opened}
      onChange={changeOpened}
      position="bottom-start"
      width={320}
      returnFocus
      trapFocus
      withInitialFocusPlaceholder={false}
      closeOnItemClick={false}
      withinPortal
    >
      <Menu.Target>
        <Button
          ref={triggerRef}
          size="xs"
          variant="light"
          className="connection-add-trigger"
          aria-label={ariaLabel}
          aria-expanded={opened}
          aria-controls={opened ? id : undefined}
          leftSection={<IconPlus size={14} />}
          onClick={() => changeOpened(!opened)}
        >
          {label}
        </Button>
      </Menu.Target>
      {opened && (
        <Menu.Dropdown
          ref={dropdownRef}
          className="connection-add-picker"
          p="xs"
        >
          <div className="connection-add-search">
            <IconSearch size={14} aria-hidden="true" />
            <input
              type="search"
              role="combobox"
              aria-label={searchLabel}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={id}
              aria-activedescendant={
                choices[active] ? `${id}-${active}` : undefined
              }
              data-autofocus
              autoFocus
              placeholder={placeholder}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div
            ref={choicesRef}
            id={id}
            role="listbox"
            aria-label={searchLabel}
            className="connection-add-choices"
          >
            {choices.map((choice, index) => (
              <button
                key={choice.value}
                id={`${id}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                data-add-value={choice.value}
                className="connection-add-choice"
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => select(choice.value)}
              >
                <span>{choice.label}</span>
                {choice.description && (
                  <span className="connection-add-description">
                    {choice.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          {!choices.length && (
            <Text size="xs" c="dimmed" p="xs" role="status">
              {options.length ? noMatchesMessage : emptyMessage}
            </Text>
          )}
        </Menu.Dropdown>
      )}
    </Menu>
  );
}
