export function shouldFollowRecentLoad(loading: boolean, loadingOlder: boolean, hasAnchor: boolean): boolean {
  return loading && !loadingOlder && !hasAnchor;
}
