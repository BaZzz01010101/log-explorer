import type { ViewFavorite } from "../shared/contracts";
import { closedTabTooltip } from "./closed-tab-history";

export function favoriteTooltip(favorite: ViewFavorite): string {
  if (!favorite.split && favorite.tabs.length === 1) {
    return closedTabTooltip({
      ...favorite.tabs[0],
      customTitle: favorite.title,
    });
  }
  const members = favorite.tabs.map((tab) => closedTabTooltip(tab));
  return [favorite.title, ...members].join("\n\n");
}
