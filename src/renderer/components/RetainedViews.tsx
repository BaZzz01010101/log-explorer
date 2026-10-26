import {
  Activity,
  Component,
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const ViewHosts = createContext<ReadonlyMap<string, HTMLDivElement>>(new Map());

interface RetainedViewProps {
  host: HTMLDivElement;
  visible: boolean;
  onActivate(): void;
  children: ReactNode;
}
interface ScrollSnapshot {
  parent: HTMLElement | null;
  positions: { element: HTMLElement; top: number; left: number }[];
}

// Chromium can reset nested scroll offsets when Activity hides a subtree or a
// split edit reparents its host. Read before DOM mutations, restore after them.
class RetainedView extends Component<RetainedViewProps> {
  private positions: ScrollSnapshot["positions"] = [];

  getSnapshotBeforeUpdate(previous: RetainedViewProps): ScrollSnapshot | null {
    if (!previous.visible) return null;
    return {
      parent: this.props.host.parentElement,
      positions: Array.from(
        this.props.host.querySelectorAll<HTMLElement>(
          ".viewer-scroll, .expanded-event-content, .inspector-content",
        ),
        (element) => ({
          element,
          top: element.scrollTop,
          left: element.scrollLeft,
        }),
      ),
    };
  }

  componentDidUpdate(
    previous: RetainedViewProps,
    _state: unknown,
    snapshot: ScrollSnapshot | null,
  ) {
    if (snapshot) this.positions = snapshot.positions;
    if (
      this.props.visible &&
      (!previous.visible || snapshot?.parent !== this.props.host.parentElement)
    ) {
      for (const { element, top, left } of this.positions) {
        if (!this.props.host.contains(element)) continue;
        element.scrollTop = top;
        element.scrollLeft = left;
      }
    }
  }

  render() {
    return (
      <Activity mode={this.props.visible ? "visible" : "hidden"}>
        <div
          className="retained-view-content"
          onPointerDownCapture={this.props.onActivate}
          onFocusCapture={this.props.onActivate}
        >
          {this.props.children}
        </div>
      </Activity>
    );
  }
}

/** Keep one viewer identity even when a split edit moves it to another pane. */
export function RetainedViews({
  ids,
  visibleIds,
  renderView,
  onActivate,
  children,
}: {
  ids: string[];
  visibleIds: string[];
  renderView(id: string): ReactNode;
  onActivate(id: string): void;
  children: ReactNode;
}) {
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const visible = new Set(visibleIds);
  const retained = ids.filter((id) => visible.has(id) || hosts.current.has(id));
  for (const id of retained) {
    if (!hosts.current.has(id)) {
      const host = document.createElement("div");
      host.className = "retained-view-host";
      hosts.current.set(id, host);
    }
  }
  useLayoutEffect(() => {
    const open = new Set(ids);
    for (const [id, host] of hosts.current) {
      if (!open.has(id)) {
        host.remove();
        hosts.current.delete(id);
      } else if (!visible.has(id)) host.remove();
    }
  });
  return (
    <ViewHosts.Provider value={hosts.current}>
      {children}
      {retained.map((id) =>
        createPortal(
          <RetainedView
            host={hosts.current.get(id)!}
            visible={visible.has(id)}
            onActivate={() => onActivate(id)}
          >
            {renderView(id)}
          </RetainedView>,
          hosts.current.get(id)!,
          id,
        ),
      )}
    </ViewHosts.Provider>
  );
}

export function RetainedViewSlot({ id }: { id: string }) {
  const host = useContext(ViewHosts).get(id);
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host) slot.current?.appendChild(host);
  }, [host]);
  return <div className="retained-view-slot" ref={slot} />;
}
