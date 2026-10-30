import { isValidElement, type ReactNode } from "react";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const ignoredTags = new Set(["SVG", "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
const controls = new Set(["BUTTON", "INPUT", "TEXTAREA", "SELECT"]);

/** Read label children without invoking components or creating temporary DOM. */
export function tooltipLabelText(label: ReactNode): string | undefined {
  if (label === null || label === undefined || typeof label === "boolean")
    return "";
  if (
    typeof label === "string" ||
    typeof label === "number" ||
    typeof label === "bigint"
  )
    return String(label);
  if (Array.isArray(label)) {
    const parts = label.map(tooltipLabelText);
    return parts.some((part) => part === undefined)
      ? undefined
      : parts.join("");
  }
  if (
    !isValidElement<{
      children?: ReactNode;
      hidden?: boolean;
      "aria-hidden"?: boolean | string;
      style?: { display?: string; visibility?: string };
    }>(label)
  )
    return undefined;
  const { children, hidden, style } = label.props;
  if (
    hidden ||
    label.props["aria-hidden"] === true ||
    label.props["aria-hidden"] === "true" ||
    style?.display === "none" ||
    style?.visibility === "hidden"
  )
    return "";
  if (
    typeof label.type === "string" &&
    ignoredTags.has(label.type.toUpperCase())
  )
    return "";
  if (label.type === "br") return " ";
  if (children === undefined)
    return typeof label.type === "string" ? "" : undefined;
  return tooltipLabelText(children);
}

/** Exact visible-text equality only; source names are normalized by their owner. */
export function tooltipIsRedundant(
  target: HTMLElement,
  label: ReactNode,
): boolean {
  const hint = tooltipLabelText(label);
  if (hint === undefined || !normalize(hint)) return false;
  const view = target.ownerDocument.defaultView;
  if (!view) return false;
  const styles = new Map<Element, CSSStyleDeclaration>();
  const styleFor = (element: Element) => {
    let style = styles.get(element);
    if (!style) {
      style = view.getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  };
  const textNodes: Text[] = [];
  const elements: HTMLElement[] = [];
  let visited = 0;
  const visibleText = (node: Node): string => {
    if (++visited > 256) throw new Error("Tooltip target is too complex");
    if (node.nodeType === 3) {
      if (node.textContent?.trim()) textNodes.push(node as Text);
      return node.textContent ?? "";
    }
    if (node.nodeType !== 1) return "";
    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();
    const style = styleFor(element);
    if (
      ignoredTags.has(tag) ||
      element.hasAttribute("hidden") ||
      element.getAttribute("aria-hidden") === "true" ||
      element.getAttribute("role") === "img" ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return "";
    if (
      element !== target &&
      (controls.has(tag) || element.getAttribute("role") === "button")
    )
      return "";
    elements.push(element);
    if (tag === "BR") return " ";
    return Array.from(element.childNodes).map(visibleText).join("");
  };
  try {
    const text = visibleText(target);
    if (!normalize(text) || normalize(text) !== normalize(hint)) return false;
    const clips = (overflow: string) =>
      /^(hidden|clip|auto|scroll)$/.test(overflow);
    for (const element of elements) {
      const style = styleFor(element);
      // Inline spans/code often have zero client dimensions while wrapping into
      // several fully visible lines. Their text ranges still measure correctly.
      if (
        element.clientWidth > 0 &&
        clips(style.overflowX || style.overflow) &&
        element.scrollWidth > element.clientWidth + 1
      )
        return false;
      if (
        element.clientHeight > 0 &&
        clips(style.overflowY || style.overflow) &&
        element.scrollHeight > element.clientHeight + 1
      )
        return false;
    }
    let measured = false;
    const range = target.ownerDocument.createRange();
    for (const text of textNodes) {
      range.selectNodeContents(text);
      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      measured ||= rects.length > 0;
      for (
        let element = text.parentElement;
        element;
        element = element.parentElement
      ) {
        const style = styleFor(element);
        const horizontal = clips(style.overflowX || style.overflow);
        const vertical = clips(style.overflowY || style.overflow);
        if (!horizontal && !vertical) continue;
        const bounds = element.getBoundingClientRect();
        const scaleX =
          element.offsetWidth > 0 ? bounds.width / element.offsetWidth : 1;
        const scaleY =
          element.offsetHeight > 0 ? bounds.height / element.offsetHeight : 1;
        const left = bounds.left + element.clientLeft * scaleX;
        const top = bounds.top + element.clientTop * scaleY;
        const right =
          left +
          (element.clientWidth > 0
            ? element.clientWidth * scaleX
            : bounds.width);
        const bottom =
          top +
          (element.clientHeight > 0
            ? element.clientHeight * scaleY
            : bounds.height);
        if (
          rects.some(
            (rect) =>
              (horizontal &&
                (rect.left < left - 1 || rect.right > right + 1)) ||
              (vertical && (rect.top < top - 1 || rect.bottom > bottom + 1)),
          )
        )
          return false;
      }
    }
    return measured;
  } catch {
    // Keep useful hints when label contents or layout cannot be proved complete.
    return false;
  }
}
