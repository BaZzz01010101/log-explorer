type Rgb = [number, number, number];

function parseColor(color: string): { rgb: Rgb; alpha: number } | undefined {
  const hex = /^#([\da-f]{6})$/i.exec(color.trim());
  if (hex)
    return {
      rgb: [0, 2, 4].map(
        (offset) => parseInt(hex[1].slice(offset, offset + 2), 16) / 255,
      ) as Rgb,
      alpha: 1,
    };
  const rgb =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(
      color,
    );
  if (!rgb) return;
  const channels = rgb.slice(1, 4).map(Number);
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (channels.some((channel) => channel > 255) || alpha > 1) return;
  return { rgb: channels.map((channel) => channel / 255) as Rgb, alpha };
}

function luminance(rgb: Rgb) {
  return rgb.reduce((sum, channel, index) => {
    const linear =
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
  const sectors: Rgb[] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const offset = lightness - chroma / 2;
  return sectors[Math.floor(hue * 6) % 6].map(
    (channel) => channel + offset,
  ) as Rgb;
}

/** Adapt only map paint; its hue and the underlying row/message color remain intact. */
export function overviewHighlightColor(
  color: string,
  background: string,
): string {
  const source = parseColor(color),
    track = parseColor(background);
  if (!source || !track) return color;
  const rgb = source.rgb.map(
    (channel, index) =>
      channel * source.alpha + track.rgb[index] * (1 - source.alpha),
  ) as Rgb;
  const trackLuminance = luminance(track.rgb),
    originalLuminance = luminance(rgb);
  const dark = trackLuminance < 0.18;
  // Leave a rounding margin above 3:1 for these very narrow non-text markers.
  const minimum = dark ? Math.min(1, (trackLuminance + 0.05) * 3.1 - 0.05) : 0;
  const maximum = dark
    ? Math.max(minimum, 0.3)
    : Math.max(0, (trackLuminance + 0.05) / 3.1 - 0.05);
  const target = Math.max(minimum, Math.min(maximum, originalLuminance));
  if (target === originalLuminance && source.alpha === 1) return color;
  const high = Math.max(...rgb),
    low = Math.min(...rgb),
    delta = high - low;
  const lightness = (high + low) / 2;
  let hue = 0;
  if (delta) {
    hue =
      high === rgb[0]
        ? ((rgb[1] - rgb[2]) / delta + 6) % 6
        : high === rgb[1]
          ? (rgb[2] - rgb[0]) / delta + 2
          : (rgb[0] - rgb[1]) / delta + 4;
    hue /= 6;
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const lowContrast = dark
    ? originalLuminance < minimum
    : originalLuminance > maximum;
  // Strengthen washed-out hues when correcting contrast, and leave neutral grays neutral.
  const adjustedSaturation =
    lowContrast && delta > 0 ? Math.max(0.55, saturation) : saturation;
  let lower = 0,
    upper = 1;
  for (let step = 0; step < 24; step++) {
    const middle = (lower + upper) / 2;
    if (luminance(hslToRgb(hue, adjustedSaturation, middle)) < target)
      lower = middle;
    else upper = middle;
  }
  return `#${hslToRgb(hue, adjustedSaturation, (lower + upper) / 2)
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Resolve CSS variables, light-dark() and named colors in the map's own theme. */
export function createOverviewColorResolver(element: HTMLElement | null) {
  if (!element?.ownerDocument) return (color: string) => color;
  let background: string | undefined;
  for (
    let ancestor: HTMLElement | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const candidate = getComputedStyle(ancestor).backgroundColor;
    if (parseColor(candidate)?.alpha === 1) {
      background = candidate;
      break;
    }
  }
  if (!background) return (color: string) => color;
  const track = background;
  const probe = element.ownerDocument.createElement("span");
  probe.style.display = "none";
  const cache = new Map<string, string>();
  return (color: string) => {
    const cached = cache.get(color);
    if (cached) return cached;
    probe.style.color = "";
    probe.style.color = color;
    let result = color;
    if (probe.style.color) {
      element.append(probe);
      try {
        result = overviewHighlightColor(getComputedStyle(probe).color, track);
      } finally {
        probe.remove();
      }
    }
    cache.set(color, result);
    return result;
  };
}
