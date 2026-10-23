import type { LogEvent } from "./contracts";
import {
  getPointer,
  matchesLocalFilter,
  MESSAGE_LIMIT,
  parseLocalFilter,
  summarizeValue,
  type JsonValue,
  type ParsedMessage,
} from "./log-data";

export type FilterOrigin = "server" | "local";

export interface FilterEvidence {
  supported: boolean;
  matched: boolean;
  /** Full target text, with half-open UTF-16 offsets into that text. */
  matches: Array<{ path: string; text: string; start: number; end: number }>;
  /** JSON Pointers with positive evidence, including existence/comparison tests. */
  paths: string[];
}

const MAX_MATCHES = 2048;
const MAX_NODES = 20_000;
const MAX_QUERY = 8192;
class Unsupported extends Error {}
const empty = (supported = true, matched = false): FilterEvidence => ({
  supported,
  matched,
  matches: [],
  paths: [],
});
const pointerToken = (key: string) =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");

interface SourceValue {
  path: string;
  text: string;
  start: number;
  end: number;
  /** Raw offsets for every decoded string boundary; absent for non-strings. */
  boundaries?: number[];
  key?: SourceValue;
  keyToken?: boolean;
  scalar: boolean;
}

/** Index source tokens rather than searching for serialized values elsewhere. */
function sourceValues(message: string): Map<string, SourceValue> {
  const values = new Map<string, SourceValue>();
  let position = 0;
  let nodes = 0;
  let duplicateWork = 0;
  const whitespace = () => {
    while (/\s/.test(message[position] ?? "") && position < message.length)
      position++;
  };
  const string = (path: string): SourceValue => {
    const start = position++;
    const boundaries = [position];
    while (position < message.length && message[position] !== '"') {
      if (message[position] === "\\") {
        position += message[position + 1] === "u" ? 6 : 2;
      } else position++;
      boundaries.push(position);
    }
    if (message[position++] !== '"') throw new Unsupported();
    return {
      path,
      start,
      end: position,
      text: JSON.parse(message.slice(start, position)) as string,
      boundaries,
      scalar: true,
    };
  };
  const value = (path: string, depth: number): SourceValue => {
    if (++nodes > MAX_NODES || depth > 32) throw new Unsupported();
    whitespace();
    const start = position;
    let item: SourceValue;
    if (message[position] === '"') item = string(path);
    else if (message[position] === "{" || message[position] === "[") {
      const object = message[position++] === "{";
      const close = object ? "}" : "]";
      let index = 0;
      whitespace();
      while (message[position] !== close) {
        const key = object ? string("") : undefined;
        const childPath = `${path}/${pointerToken(key ? key.text : String(index++))}`;
        if (key) {
          key.path = `@key${childPath}`;
          key.keyToken = true;
          whitespace();
          if (message[position++] !== ":") throw new Unsupported();
        }
        // JSON.parse keeps the last duplicate key, including its whole subtree.
        if (values.has(childPath)) {
          for (const existing of values.keys()) {
            if (++duplicateWork > 200_000) throw new Unsupported();
            if (existing === childPath || existing.startsWith(`${childPath}/`))
              values.delete(existing);
          }
        }
        const child = value(childPath, depth + 1);
        child.key = key;
        whitespace();
        if (message[position] === close) break;
        if (message[position++] !== ",") throw new Unsupported();
        whitespace();
      }
      position++;
      item = { path, text: "", start, end: position, scalar: false };
    } else {
      while (position < message.length && !/[\s,}\]]/.test(message[position]!))
        position++;
      if (position === start) throw new Unsupported();
      item = {
        path,
        text: summarizeValue(
          JSON.parse(message.slice(start, position)) as JsonValue,
          MESSAGE_LIMIT,
        ),
        start,
        end: position,
        scalar: true,
      };
    }
    values.set(path, item);
    return item;
  };
  value("", 0);
  whitespace();
  if (position !== message.length) throw new Unsupported();
  return values;
}

type Range = { start: number; end: number };

class EvidenceBuilder {
  readonly evidence = empty(true, true);
  private readonly seen = new Set<string>();
  private readonly pathSet = new Set<string>();
  private readonly atoms: SourceValue[];

  constructor(
    readonly event: LogEvent,
    readonly sources: Map<string, SourceValue>,
  ) {
    this.atoms = [...sources.values()]
      .flatMap((item) => [
        ...(item.scalar ? [item] : []),
        ...(item.key ? [item.key] : []),
      ])
      .sort((a, b) => a.start - b.start);
  }

  path(path: string) {
    if (!this.pathSet.has(path)) {
      if (this.pathSet.size >= MAX_MATCHES) throw new Unsupported();
      this.pathSet.add(path);
      this.evidence.paths.push(path);
    }
  }

  span(path: string, text: string, start: number, end: number) {
    if (start >= end) return;
    const key = `${path}\n${start}:${end}`;
    if (this.seen.has(key)) return;
    if (this.evidence.matches.length >= MAX_MATCHES) throw new Unsupported();
    this.seen.add(key);
    this.evidence.matches.push({ path, text, start, end });
  }

  property(
    path: string,
    text: string,
    ranges: Range[] = [{ start: 0, end: text.length }],
  ) {
    this.path(path);
    const source = this.sources.get(path);
    for (const range of ranges) {
      this.span(path, text, range.start, range.end);
      if (source) {
        const start = source.boundaries?.[range.start] ?? source.start;
        const end = source.boundaries?.[range.end] ?? source.end;
        this.span("@message", this.event.message, start, end);
      }
    }
  }

  raw(range: Range) {
    this.span("@message", this.event.message, range.start, range.end);
    // Find the one source atom containing the raw match; do not transfer it to
    // another property merely because it has the same value.
    let low = 0;
    let high = this.atoms.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.atoms[middle]!.start <= range.start) low = middle + 1;
      else high = middle;
    }
    const atom = this.atoms[low - 1];
    if (!atom || range.start < atom.start || range.end > atom.end) return;
    if (atom.boundaries) {
      const boundary = (offset: number) => {
        let low = 0;
        let high = atom.boundaries!.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (atom.boundaries![middle]! < offset) low = middle + 1;
          else high = middle;
        }
        return atom.boundaries![low] === offset ? low : -1;
      };
      const start = boundary(range.start);
      const end = boundary(range.end);
      // A raw match inside an escape sequence is not a decoded text match.
      if (start < 0 || end < 0 || start >= end) return;
      this.span(atom.path, atom.text, start, end);
    } else {
      if (this.event.message.slice(atom.start, atom.end) !== atom.text) return;
      this.span(
        atom.path,
        atom.text,
        range.start - atom.start,
        range.end - atom.start,
      );
    }
    this.path(atom.keyToken ? atom.path.slice(4) : atom.path);
  }
}

function literalRanges(
  text: string,
  needle: string,
  insensitive = false,
  word = false,
): Range[] {
  if (!needle) return [];
  // Case folding can change UTF-16 length (for example U+0130). Keep a source
  // boundary map so the local matcher's lowercasing does not shift highlights.
  let haystack = text;
  let boundaries: number[] | undefined;
  if (insensitive) {
    haystack = text.toLowerCase();
    needle = needle.toLowerCase();
    if (haystack.length !== text.length) {
      boundaries = [];
      for (let index = 0; index < text.length; index++) {
        const folded = text[index]!.toLowerCase();
        for (let unit = 0; unit < folded.length; unit++) boundaries.push(index);
      }
      boundaries.push(text.length);
    }
  }
  const ranges: Range[] = [];
  let position = 0;
  while (position <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, position);
    if (start < 0) break;
    const end = start + needle.length;
    if (
      !word ||
      (!/[A-Za-z0-9_]/.test(haystack[start - 1] ?? "") &&
        !/[A-Za-z0-9_]/.test(haystack[end] ?? ""))
    ) {
      ranges.push({
        start: boundaries?.[start] ?? start,
        end: boundaries ? boundaries[end - 1]! + 1 : end,
      });
      if (ranges.length > MAX_MATCHES) throw new Unsupported();
    }
    position = end;
  }
  return ranges;
}

/** Validate only the documented AWS subset; never accept JS-only extensions. */
function awsRegex(pattern: string): RegExp {
  if (!pattern || pattern.length > 512 || /[^\x20-\x7e]/.test(pattern))
    throw new Unsupported();
  let normalized = "";
  let atom = false;
  let quantified = false;
  let branchPresent = false;
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index]!;
    if (character === "\\") {
      const next = pattern[++index];
      if (!next) throw new Unsupported();
      if (next === "x") {
        const hex = pattern.slice(index + 1, index + 3);
        if (!/^[0-7][0-9A-Fa-f]$/.test(hex)) throw new Unsupported();
        normalized += `\\x${hex}`;
        index += 2;
      } else if (/[dDsSwW]/.test(next) || /[\^$?\[\]{}|\\*+.]/.test(next))
        normalized += `\\${next}`;
      else throw new Unsupported();
      atom = true;
      branchPresent = true;
      quantified = false;
    } else if (character === "[") {
      let content = "";
      if (pattern[index + 1] === "^") content += pattern[++index];
      let count = 0;
      while (++index < pattern.length && pattern[index] !== "]") {
        let part = pattern[index]!;
        if (part === "\\") {
          const escaped = pattern[++index];
          if (!escaped || !/[dDsSwW\^$?\[\]{}|\\*+.\-]/.test(escaped))
            throw new Unsupported();
          part += escaped;
        } else if (!/[A-Za-z0-9:_#=@/;,\-]/.test(part)) throw new Unsupported();
        content += part;
        count++;
      }
      if (pattern[index] !== "]" || count === 0) throw new Unsupported();
      normalized += `[${content}]`;
      atom = true;
      branchPresent = true;
      quantified = false;
    } else if (
      character === "*" ||
      character === "+" ||
      character === "?" ||
      character === "{"
    ) {
      if (!atom || quantified) throw new Unsupported();
      if (character === "{") {
        const quantifier = pattern.slice(index).match(/^\{(\d*)(?:,(\d*))?\}/);
        if (!quantifier || (!quantifier[1] && !quantifier[2]))
          throw new Unsupported();
        const minimum = Number(quantifier[1] || 0);
        const maximum =
          quantifier[2] === undefined
            ? minimum
            : Number(quantifier[2] || Infinity);
        if (
          minimum > 1000 ||
          (maximum !== Infinity && maximum > 1000) ||
          minimum > maximum
        )
          throw new Unsupported();
        normalized += `{${minimum}${quantifier[0].includes(",") ? `,${maximum === Infinity ? "" : maximum}` : ""}}`;
        index += quantifier[0].length - 1;
      } else normalized += character;
      quantified = true;
    } else if (character === "|") {
      if (!branchPresent) throw new Unsupported();
      normalized += character;
      atom = false;
      branchPresent = false;
      quantified = false;
    } else if (character === "^") {
      if (index !== 0 && pattern[index - 1] !== "|") throw new Unsupported();
      normalized += character;
      atom = false;
      branchPresent = true;
    } else if (character === "$") {
      if (index !== pattern.length - 1 && pattern[index + 1] !== "|")
        throw new Unsupported();
      normalized += character;
      branchPresent = true;
      quantified = true;
    } else if (/[A-Za-z0-9:_#=@/;,\-.]/.test(character)) {
      normalized += character;
      atom = true;
      branchPresent = true;
      quantified = false;
    } else throw new Unsupported();
  }
  if (!branchPresent) throw new Unsupported();
  try {
    return new RegExp(normalized, "g");
  } catch {
    throw new Unsupported();
  }
}

function regexRanges(
  text: string,
  regex: RegExp,
): { matched: boolean; ranges: Range[] } {
  regex.lastIndex = 0;
  const ranges: Range[] = [];
  let matched = false;
  let result: RegExpExecArray | null;
  while ((result = regex.exec(text))) {
    matched = true;
    if (result[0].length)
      ranges.push({
        start: result.index,
        end: result.index + result[0].length,
      });
    else regex.lastIndex++;
    if (ranges.length > MAX_MATCHES) throw new Unsupported();
  }
  return { matched, ranges };
}

type Selector = Array<string | number | null>;
type Expected =
  | {
      kind: "value";
      value: null | boolean | number | string;
      wildcard?: boolean;
      numericWildcard?: boolean;
    }
  | { kind: "regex"; regex: RegExp }
  | { kind: "exists" };
type Predicate = {
  kind: "predicate";
  selector: Selector;
  operator: string;
  expected?: Expected;
};
type Expression =
  Predicate | { kind: "and" | "or"; left: Expression; right: Expression };

class ServerParser {
  position = 0;
  nodes = 0;
  regexCount = 0;
  wildcardCount = 0;
  constructor(readonly query: string) {}
  whitespace() {
    while (
      /\s/.test(this.query[this.position] ?? "") &&
      this.position < this.query.length
    )
      this.position++;
  }
  take(value: string) {
    this.whitespace();
    if (!this.query.startsWith(value, this.position)) return false;
    this.position += value.length;
    return true;
  }
  require(value: string) {
    if (!this.take(value)) throw new Unsupported();
  }
  quoted(): string {
    this.whitespace();
    const start = this.position;
    if (this.query[this.position++] !== '"') throw new Unsupported();
    while (this.position < this.query.length) {
      const character = this.query[this.position++]!;
      if (character === "\\") this.position++;
      else if (character === '"') {
        try {
          return JSON.parse(this.query.slice(start, this.position)) as string;
        } catch {
          throw new Unsupported();
        }
      }
    }
    throw new Unsupported();
  }
  regex(): RegExp {
    this.require("%");
    const end = this.query.indexOf("%", this.position);
    if (end < 0 || ++this.regexCount > 2) throw new Unsupported();
    const regex = awsRegex(this.query.slice(this.position, end));
    this.position = end + 1;
    return regex;
  }
  selector(): Selector {
    this.require("$");
    const selector: Selector = [];
    let wildcard = false;
    while (true) {
      const dotted = this.take(".");
      if (this.take("[")) {
        if (this.take("*")) {
          if (wildcard || ++this.wildcardCount > 3) throw new Unsupported();
          wildcard = true;
          selector.push(null);
        } else if (this.take("'")) {
          const end = this.query.indexOf("'", this.position);
          if (end < 0) throw new Unsupported();
          const key = this.query.slice(this.position, end);
          if (/[\\\r\n]/.test(key)) throw new Unsupported();
          selector.push(key);
          this.position = end + 1;
        } else {
          const index = this.query
            .slice(this.position)
            .match(/^(?:0|[1-9]\d*)/);
          if (!index) throw new Unsupported();
          const number = Number(index[0]);
          if (!Number.isSafeInteger(number)) throw new Unsupported();
          selector.push(number);
          this.position += index[0].length;
        }
        this.require("]");
      } else if (dotted) {
        if (this.take("*")) {
          if (wildcard || ++this.wildcardCount > 3) throw new Unsupported();
          wildcard = true;
          selector.push(null);
        } else {
          const key = this.query.slice(this.position).match(/^[A-Za-z0-9_-]+/);
          if (!key) throw new Unsupported();
          selector.push(key[0]);
          this.position += key[0].length;
        }
      } else break;
      if (selector.length > 32) throw new Unsupported();
    }
    if (!selector.length) throw new Unsupported();
    return selector;
  }
  expression(depth = 0): Expression {
    if (depth > 32) throw new Unsupported();
    let left = this.conjunction(depth);
    while (this.take("||"))
      left = { kind: "or", left, right: this.conjunction(depth) };
    return left;
  }
  conjunction(depth: number): Expression {
    let left = this.predicate(depth);
    while (this.take("&&"))
      left = { kind: "and", left, right: this.predicate(depth) };
    return left;
  }
  predicate(depth: number): Expression {
    if (++this.nodes > 128) throw new Unsupported();
    if (this.take("(")) {
      const expression = this.expression(depth + 1);
      this.require(")");
      return expression;
    }
    const selector = this.selector();
    this.whitespace();
    const absent = this.query.slice(this.position).match(/^NOT\s+EXISTS\b/);
    if (absent) {
      this.position += absent[0].length;
      return { kind: "predicate", selector, operator: "absent" };
    }
    const is = this.query
      .slice(this.position)
      .match(/^IS\s+(NULL|TRUE|FALSE)\b/);
    if (is) {
      this.position += is[0].length;
      const value = is[1] === "NULL" ? null : is[1] === "TRUE";
      return {
        kind: "predicate",
        selector,
        operator: "=",
        expected: { kind: "value", value },
      };
    }
    this.whitespace();
    const operator = this.query
      .slice(this.position)
      .match(/^(?:!=|>=|<=|=|>|<)/)?.[0];
    if (!operator) throw new Unsupported();
    this.position += operator.length;
    this.whitespace();
    let expected: Expected;
    if (this.query[this.position] === "%")
      expected = { kind: "regex", regex: this.regex() };
    else if (this.query[this.position] === '"') {
      const value = this.quoted();
      expected = { kind: "value", value, wildcard: value.includes("*") };
    } else {
      const token = this.query.slice(this.position).match(/^[^\s)}&|]+/)?.[0];
      if (!token) throw new Unsupported();
      this.position += token.length;
      if (token === "*") expected = { kind: "exists" };
      else if (
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token) &&
        Number.isFinite(Number(token))
      )
        expected = { kind: "value", value: Number(token) };
      else if (/^(?:true|false|null)$/.test(token))
        expected = {
          kind: "value",
          value: JSON.parse(token) as boolean | null,
        };
      else if (/^[A-Za-z0-9_*.-]+$/.test(token))
        expected = {
          kind: "value",
          value: token,
          wildcard: token.includes("*"),
          numericWildcard: true,
        };
      else throw new Unsupported();
    }
    if (
      (expected.kind !== "value" || typeof expected.value !== "number") &&
      operator !== "=" &&
      operator !== "!="
    )
      throw new Unsupported();
    return { kind: "predicate", selector, operator, expected };
  }
}

function select(
  value: JsonValue | undefined,
  selector: Selector,
): Array<{ path: string; value: JsonValue }> {
  if (value === undefined) return [];
  let selected = [{ path: "", value }];
  let nodes = 0;
  for (const segment of selector) {
    const next: typeof selected = [];
    for (const item of selected) {
      if (item.value === null || typeof item.value !== "object") continue;
      if (segment === null) {
        for (const [key, value] of Object.entries(item.value)) {
          if (++nodes > MAX_NODES) throw new Unsupported();
          next.push({ path: `${item.path}/${pointerToken(key)}`, value });
        }
      } else if (
        (typeof segment !== "number" || Array.isArray(item.value)) &&
        Object.hasOwn(item.value, segment)
      ) {
        next.push({
          path: `${item.path}/${pointerToken(String(segment))}`,
          value: (item.value as Record<string, JsonValue>)[segment]!,
        });
      }
    }
    selected = next;
  }
  return selected;
}

function wildcardMatches(text: string, pattern: string): boolean {
  const pieces = pattern.split("*");
  const first = pieces.shift()!;
  const last = pieces.pop() ?? "";
  if (!text.startsWith(first) || !text.endsWith(last)) return false;
  let position = first.length;
  for (const piece of pieces) {
    const found = text.indexOf(piece, position);
    if (found < 0) return false;
    position = found + piece.length;
  }
  return position <= text.length - last.length;
}

interface Positive {
  path: string;
  text: string;
  ranges?: Range[];
}
interface Evaluation {
  matched: boolean;
  positive: Positive[];
}
function evaluate(expression: Expression, parsed: ParsedMessage): Evaluation {
  if (expression.kind !== "predicate") {
    const left = evaluate(expression.left, parsed);
    const right = evaluate(expression.right, parsed);
    const matched =
      expression.kind === "and"
        ? left.matched && right.matched
        : left.matched || right.matched;
    return {
      matched,
      positive: matched
        ? [
            ...(left.matched ? left.positive : []),
            ...(right.matched ? right.positive : []),
          ]
        : [],
    };
  }
  if (parsed.kind !== "json") return { matched: false, positive: [] };
  const selected = select(parsed.value, expression.selector);
  if (expression.operator === "absent")
    return { matched: selected.length === 0, positive: [] };
  const expected = expression.expected!;
  const positive: Positive[] = [];
  for (const item of selected) {
    if (
      item.value !== null &&
      typeof item.value === "object" &&
      expected.kind !== "exists"
    )
      continue;
    const text = summarizeValue(item.value, MESSAGE_LIMIT);
    let result = false;
    let ranges: Range[] | undefined;
    if (expected.kind === "exists") result = true;
    else if (expected.kind === "regex") {
      if (typeof item.value !== "string") continue;
      const match = regexRanges(text, expected.regex);
      result = match.matched;
      ranges = match.ranges;
    } else if (expected.wildcard && typeof expected.value === "string") {
      result =
        (typeof item.value === "string" ||
          (expected.numericWildcard === true &&
            typeof item.value === "number")) &&
        wildcardMatches(text, expected.value);
    } else if (expression.operator === "=" || expression.operator === "!=")
      result = item.value === expected.value;
    else if (
      typeof item.value === "number" &&
      typeof expected.value === "number"
    ) {
      switch (expression.operator) {
        case ">":
          result = item.value > expected.value;
          break;
        case ">=":
          result = item.value >= expected.value;
          break;
        case "<":
          result = item.value < expected.value;
          break;
        case "<=":
          result = item.value <= expected.value;
          break;
      }
    }
    if (expression.operator === "!=") {
      result = !result;
      ranges = undefined;
    }
    if (result) positive.push({ path: item.path, text, ranges });
    if (positive.length > MAX_MATCHES) throw new Unsupported();
  }
  return { matched: positive.length > 0, positive };
}

/**
 * Called in the highlight worker: user regex execution belongs behind its
 * deadline/termination boundary. Unsupported syntax or resource limits yield no
 * speculative evidence. Local syntax deliberately follows matchesLocalFilter.
 */
export function evaluateFilterEvidence(
  event: LogEvent,
  parsed: ParsedMessage,
  query: string,
  origin: FilterOrigin,
): FilterEvidence {
  try {
    if (event.message.length > MESSAGE_LIMIT || query.length > MAX_QUERY)
      throw new Unsupported();
    if (!query.trim()) return empty(true, true);
    const sources =
      parsed.kind === "json"
        ? sourceValues(event.message)
        : new Map<string, SourceValue>();
    const builder = new EvidenceBuilder(event, sources);
    if (origin === "local") {
      const terms = parseLocalFilter(query);
      if (!terms || terms.length > 128) return empty(false);
      if (!matchesLocalFilter(event, parsed, query, "all")) return empty();
      for (const term of terms) {
        if (term.kind === "property") {
          builder.property(
            term.path,
            summarizeValue(getPointer(parsed.value, term.path), MESSAGE_LIMIT),
          );
        } else {
          for (const range of literalRanges(event.message, term.text, true))
            builder.raw(range);
          for (const [path, text] of [
            ["@logGroup", event.logGroup],
            ["@logStream", event.logStream],
          ] as const)
            for (const range of literalRanges(text, term.text, true))
              builder.span(path, text, range.start, range.end);
        }
      }
      return builder.evidence;
    }
    const parser = new ServerParser(query.trim());
    if (parser.take("{")) {
      const expression = parser.expression();
      parser.require("}");
      parser.whitespace();
      if (parser.position !== parser.query.length) throw new Unsupported();
      if (parsed.kind === "limited") throw new Unsupported();
      const result = evaluate(expression, parsed);
      if (!result.matched) return empty();
      for (const positive of result.positive)
        builder.property(positive.path, positive.text, positive.ranges);
      return builder.evidence;
    }
    if (parser.query === '" "') return empty(true, true);
    const terms: Array<{ regex?: RegExp; text?: string; word?: boolean }> = [];
    while (parser.position < parser.query.length) {
      if (++parser.nodes > 128) throw new Unsupported();
      const character = parser.query[parser.position];
      if (character === '"') terms.push({ text: parser.quoted() });
      else if (character === "%") terms.push({ regex: parser.regex() });
      else {
        const token = parser.query
          .slice(parser.position)
          .match(/^[A-Za-z0-9_]+/)?.[0];
        if (!token) throw new Unsupported();
        terms.push({ text: token, word: true });
        parser.position += token.length;
      }
      if (
        parser.position < parser.query.length &&
        !/\s/.test(parser.query[parser.position]!)
      )
        throw new Unsupported();
      parser.whitespace();
    }
    let matched = true;
    const ranges: Range[] = [];
    for (const term of terms) {
      const literals = term.regex
        ? []
        : literalRanges(event.message, term.text!, false, term.word);
      const result = term.regex
        ? regexRanges(event.message, term.regex)
        : {
            matched: term.text === "" || literals.length > 0,
            ranges: literals,
          };
      matched &&= result.matched;
      ranges.push(...result.ranges);
    }
    if (!matched) return empty();
    for (const range of ranges) builder.raw(range);
    return builder.evidence;
  } catch {
    return empty(false);
  }
}
