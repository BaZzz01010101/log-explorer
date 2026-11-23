import { createContext, useContext } from "react";

/**
 * Typed application-level commands for deep components, replacing untyped
 * window CustomEvents as a second message channel.
 */
export interface AppCommands {
  openTimeRangeSettings(): void;
  /** Adds a Message column rule and opens it in Settings. */
  addMessageRule(rule: { source: string; path: string }): void;
}
export const AppCommandsContext = createContext<AppCommands>({
  openTimeRangeSettings: () => {},
  addMessageRule: () => {},
});
export const useAppCommands = (): AppCommands => useContext(AppCommandsContext);
