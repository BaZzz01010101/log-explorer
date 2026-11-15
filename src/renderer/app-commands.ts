import { createContext, useContext } from "react";

/**
 * Typed application-level commands for deep components, replacing untyped
 * window CustomEvents as a second message channel.
 */
export interface AppCommands {
  openTimeRangeSettings(): void;
}
export const AppCommandsContext = createContext<AppCommands>({
  openTimeRangeSettings: () => {},
});
export const useAppCommands = (): AppCommands => useContext(AppCommandsContext);
