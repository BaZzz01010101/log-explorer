// Workspace model: types, file parsing/migration and the reducer live in
// separate modules; this barrel keeps existing imports stable.
export * from "./workspace-types";
export * from "./workspace-parse";
export * from "./workspace-reducer";
export {
  createTab,
  consistentProjection,
  persistedWorkspace,
} from "./workspace-entry-state";
export {
  projectFavoriteOpen,
  projectFavoriteSave,
  projectResourceFavorite,
} from "./workspace-favorites";
export {
  createResourceTabs,
  projectResourceAction,
  projectResourceDrop,
  projectWorkspaceDrop,
} from "./workspace-drop";
