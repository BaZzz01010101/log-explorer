export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
export const box = (left = 0, top = 0, width = 120, height = 20): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});
export class TooltipNode extends EventTarget {
  nodeType = 0;
  parentElement: TooltipElement | null = null;
  childNodes: TooltipNode[] = [];
  textContent = "";
}
export class TooltipText extends TooltipNode {
  nodeType = 3;
  constructor(
    text: string,
    public rects = [box(0, 0, text.length * 7, 18)],
  ) {
    super();
    this.textContent = text;
  }
}
export class TooltipDocument extends EventTarget {
  defaultView = {
    getComputedStyle: (element: TooltipElement) => element.style,
  };
  documentElement!: TooltipElement;
  createRange() {
    let node: TooltipText;
    return {
      selectNodeContents: (next: TooltipText) => {
        node = next;
      },
      getClientRects: () => node.rects,
      detach() {},
    };
  }
}
export const tooltipDocument = new TooltipDocument();
export class TooltipElement extends TooltipNode {
  nodeType = 1;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  ownerDocument = tooltipDocument;
  isConnected = true;
  clientWidth = 120;
  clientHeight = 20;
  scrollWidth = 120;
  scrollHeight = 20;
  clientLeft = 0;
  clientTop = 0;
  offsetWidth = 120;
  offsetHeight = 20;
  rect = box();
  style: Record<string, string> = {
    display: "block",
    visibility: "visible",
    overflow: "visible",
    overflowX: "visible",
    overflowY: "visible",
    textOverflow: "clip",
    webkitLineClamp: "none",
  };
  constructor(
    public tagName = "SPAN",
    text = "",
  ) {
    super();
    if (text) this.append(new TooltipText(text));
  }
  append(...nodes: TooltipNode[]) {
    for (const node of nodes) {
      node.parentElement = this;
      this.childNodes.push(node);
    }
  }
  getAttribute(name: string) {
    if (name.startsWith("data-"))
      return (
        this.dataset[
          name.slice(5).replace(/-([a-z])/g, (_match, key) => key.toUpperCase())
        ] ?? null
      );
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  hasAttribute(name: string) {
    return this.getAttribute(name) !== null;
  }
  getBoundingClientRect() {
    return this.rect;
  }
  contains(node: TooltipNode | null): boolean {
    return (
      node === this ||
      Boolean(
        node &&
        this.childNodes.some(
          (child) =>
            child === node ||
            (child instanceof TooltipElement && child.contains(node)),
        ),
      )
    );
  }
  closest<T = TooltipElement>(selector: string): T | null {
    let node: TooltipElement | null = this;
    while (node) {
      if (
        selector.split(",").some((part) => {
          const item = part.trim();
          if (item.startsWith("."))
            return (node!.getAttribute("class") ?? "")
              .split(" ")
              .includes(item.slice(1));
          const match = item.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
          return Boolean(
            match &&
            (match[2] === undefined
              ? node!.hasAttribute(match[1])
              : node!.getAttribute(match[1]) === match[2]),
          );
        })
      )
        return node as T;
      node = node.parentElement;
    }
    return null;
  }
  html() {
    return this as unknown as HTMLElement;
  }
}
tooltipDocument.documentElement = new TooltipElement("HTML");
export function sized(element: TooltipElement, width: number, height = 20) {
  element.clientWidth = element.scrollWidth = element.offsetWidth = width;
  element.clientHeight = element.scrollHeight = element.offsetHeight = height;
  element.rect = box(0, 0, width, height);
  return element;
}
