type Node =
  | { kind: "and" | "or"; left: Node; right: Node }
  | { kind: "comparison"; path: string; operator: string; value: string };

/** Parse only the deliberately small, provider-native JSON filter language. */
export function compileUnifiedFilter(
  input: string,
  provider: "aws" | "gcp",
): string {
  if (input.length > 4096) throw new Error("Unified filter is too long.");
  const tokens: string[] = [];
  const lex =
    /\s*(\$\.[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*|"(?:[^"\\]|\\.)*"|>=|<=|!=|=|>|<|\(|\)|-?(?:0|[1-9]\d*)(?:\.\d+)?|[A-Za-z_]+|.)/gy;
  let position = 0;
  while (position < input.length) {
    if (!input.slice(position).trim()) break;
    lex.lastIndex = position;
    const match = lex.exec(input);
    if (!match) throw new Error("Invalid unified filter.");
    tokens.push(match[1]);
    position = lex.lastIndex;
    if (tokens.length > 512) throw new Error("Unified filter is too complex.");
  }
  let cursor = 0;
  const fail = (): never => {
    throw new Error(
      `Invalid or unsupported unified filter near ${tokens[cursor] ?? "end of input"}.`,
    );
  };
  const keyword = (value: string) => tokens[cursor]?.toUpperCase() === value;
  const atom = (depth: number): Node => {
    if (depth > 32) throw new Error("Unified filter nesting is too deep.");
    if (tokens[cursor] === "(") {
      cursor++;
      const result = or(depth + 1);
      if (tokens[cursor++] !== ")") fail();
      return result;
    }
    const path = tokens[cursor++];
    if (!path || !/^\$\.[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$/.test(path))
      return fail();
    let operator = tokens[cursor++]?.toUpperCase();
    if (operator === "IS") {
      const value = tokens[cursor++]?.toUpperCase();
      if (value === "NOT") throw new Error("Unified does not support IS NOT NULL or IS NOT UNDEFINED.");
      if (value !== "NULL" && value !== "UNDEFINED") return fail();
      return { kind: "comparison", path, operator: value, value: "" };
    }
    if (!operator || !["=", "!=", ">", ">=", "<", "<="].includes(operator))
      return fail();
    const value = tokens[cursor++];
    if (!value) return fail();
    if (/^(null|undefined)$/i.test(value)) {
      if (operator !== "=") throw new Error("Unified supports null and undefined only with = or IS.");
      return {
        kind: "comparison",
        path,
        operator: value.toUpperCase(),
        value: "",
      };
    }
    const boolean = /^(true|false)$/i.test(value);
    const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
    const quoted = /^"(?:[^"\\]|\\.)*"$/.test(value);
    if (!boolean && !numeric && !quoted) return fail();
    if (!numeric && !["=", "!="].includes(operator)) return fail();
    if (boolean && operator !== "=") return fail();
    if (quoted) {
      let decoded: string;
      try {
        decoded = JSON.parse(value);
      } catch {
        return fail();
      }
      if (/[\x00-\x1f*"\\]/.test(decoded))
        throw new Error(
          "Unified string contains characters that cannot be safely translated to both providers.",
        );
    }
    return {
      kind: "comparison",
      path,
      operator,
      value: boolean ? value.toLowerCase() : value,
    };
  };
  const and = (depth: number): Node => {
    let node = atom(depth);
    while (keyword("AND")) {
      cursor++;
      node = { kind: "and", left: node, right: atom(depth) };
    }
    return node;
  };
  const or = (depth: number): Node => {
    let node = and(depth);
    while (keyword("OR")) {
      cursor++;
      node = { kind: "or", left: node, right: and(depth) };
    }
    return node;
  };
  const tree = or(0);
  if (cursor !== tokens.length) fail();
  const render = (node: Node): string => {
    if (node.kind !== "comparison")
      return `(${render(node.left)} ${provider === "aws" ? (node.kind === "and" ? "&&" : "||") : node.kind.toUpperCase()} ${render(node.right)})`;
    const path = provider === "aws" ? node.path : `jsonPayload.${node.path.slice(2).split(".").map((part) => part.includes("-") ? JSON.stringify(part) : part).join(".")}`;
    if (node.operator === "NULL")
      return provider === "aws"
        ? `(${path} IS NULL)`
        : `(${path} = NULL_VALUE)`;
    if (node.operator === "UNDEFINED")
      return provider === "aws"
        ? `(${path} NOT EXISTS)`
        : `(jsonPayload:* AND NOT ${path}:*)`;
    if (provider === "aws" && /^(true|false)$/.test(node.value))
      return `(${path} IS ${node.value.toUpperCase()})`;
    return `(${path} ${node.operator} ${node.value})`;
  };
  const result = render(tree);
  return provider === "aws" ? `{ ${result} }` : result;
}
