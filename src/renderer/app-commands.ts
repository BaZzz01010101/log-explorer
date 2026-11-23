import { createContext, useContext } from "react";
import type { Preferences } from "../shared/contracts";
import type { HighlightTextColor } from "../shared/quick-highlight";

/**
 * Typed application-level commands for deep components, replacing untyped
 * window CustomEvents as a second message channel.
 */
export interface AppCommands {
  openTimeRangeSettings(): void;
  /** Adds a Message column rule and opens it in Settings. */
  addMessageRule(rule: { source: string; path: string }): void;
  /** Saves the highlight text color of one theme. */
  setHighlightTextColor(
    theme: Preferences["theme"],
    color: HighlightTextColor,
  ): void;
}
export const AppCommandsContext = createContext<AppCommands>({
  openTimeRangeSettings: () => {},
  addMessageRule: () => {},
  setHighlightTextColor: () => {},
});
export const useAppCommands = (): AppCommands => useContext(AppCommandsContext);
