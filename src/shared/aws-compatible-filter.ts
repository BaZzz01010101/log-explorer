type Predicate = {
  path: string[];
  operator:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "IS NULL"
    | "IS TRUE"
    | "IS FALSE"
    | "NOT EXISTS";
  operand?: string;
  numericOperand?: boolean;
};

/** The deliberately narrow AWS subset whose behavior is verified against AWS. */
export function parseAwsCompatibleFilter(pattern: string): Predicate {
  const match =
    /^\{\s*\$\.([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*)\s*(?:(NOT\s+EXISTS|IS\s+(?:NULL|TRUE|FALSE))|(>=|<=|!=|=|>|<)\s*("(?:[^"\\]|\\.)*"|[A-Za-z0-9_+.-]+))\s*\}$/i.exec(
      pattern.trim(),
    );
  const unsupported = () =>
    new Error(
      "Mixed AWS and Google Cloud views support plain text and a single AWS JSON field comparison. Compound patterns, wildcards, arrays and regular expressions are not supported.",
    );
  if (!match) throw unsupported();
  const operator = (match[2] ?? match[3])
    .toUpperCase()
    .replace(/\s+/g, " ") as Predicate["operator"];
  let operand = match[4];
  const numericOperand =
    !!operand &&
    !operand.startsWith('"') &&
    /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(operand);
  if (operand?.startsWith('"')) {
    try {
      operand = JSON.parse(operand) as string;
    } catch {
      throw unsupported();
    }
  }
  if (operand?.includes("*") || operand?.includes("%")) throw unsupported();
  if (
    [">", "<", ">=", "<="].includes(operator) &&
    (!operand || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(operand))
  )
    throw unsupported();
  return { path: match[1].split("."), operator, operand, numericOperand };
}

export function matchAwsCompatibleFilter(
  predicate: Predicate,
  message: string,
): boolean {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return false;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let exists = true;
  for (const key of predicate.path) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.prototype.hasOwnProperty.call(value, key)
    ) {
      exists = false;
      break;
    }
    value = (value as Record<string, unknown>)[key];
  }
  if (predicate.operator === "NOT EXISTS") return !exists;
  if (!exists) return false;
  if (predicate.operator === "IS NULL") return value === null;
  if (predicate.operator === "IS TRUE") return value === true;
  if (predicate.operator === "IS FALSE") return value === false;
  if (typeof value !== "string" && typeof value !== "number") return false;
  const equal =
    typeof value === "number" && predicate.numericOperand
      ? value === Number(predicate.operand)
      : String(value) === predicate.operand;
  if (predicate.operator === "=") return equal;
  if (predicate.operator === "!=") return !equal;
  if (typeof value !== "number") return false;
  const operand = Number(predicate.operand);
  switch (predicate.operator) {
    case ">":
      return value > operand;
    case "<":
      return value < operand;
    case ">=":
      return value >= operand;
    case "<=":
      return value <= operand;
    default:
      return false;
  }
}
