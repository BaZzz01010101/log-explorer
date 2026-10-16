import { z } from "zod";

const colorsSchema = z.object({
  foreground: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .optional(),
  background: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .optional(),
});
export const highlightRuleSchema = z.object({
  id: z.string().min(1).max(100),
  enabled: z.boolean(),
  scope: z.enum(["text", "structured"]),
  path: z.string().max(512),
  pattern: z.string().max(500),
  ignoreCase: z.boolean(),
  target: z.enum(["row", "text"]),
  colors: colorsSchema,
  separateThemeColors: z.boolean(),
  lightColors: colorsSchema.optional(),
  darkColors: colorsSchema.optional(),
});
export const highlightProfileSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().max(120),
    enabled: z.boolean(),
    groupPattern: z.string().max(500),
    groupIgnoreCase: z.boolean(),
    rules: z.array(highlightRuleSchema).max(20),
  })
  .refine(
    (profile) =>
      new Set(profile.rules.map((rule) => rule.id)).size ===
      profile.rules.length,
    "Rule IDs must be unique",
  );
export const highlightProfilesSchema = z
  .array(highlightProfileSchema)
  .max(20)
  .refine(
    (profiles) =>
      new Set(profiles.map((profile) => profile.id)).size === profiles.length,
    "Profile IDs must be unique",
  );
export type HighlightColors = z.infer<typeof colorsSchema>;
export type HighlightRule = z.infer<typeof highlightRuleSchema>;
export type HighlightProfile = z.infer<typeof highlightProfileSchema>;

export function parseHighlightProfiles(value: unknown): HighlightProfile[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 20).flatMap((item) => {
    const parsed = highlightProfileSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id)) return [];
    ids.add(parsed.data.id);
    return [parsed.data];
  });
}

export function regexError(pattern: string): string | undefined {
  if (pattern.length > 500) return "Use at most 500 characters.";
  try {
    new RegExp(pattern);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid regular expression";
  }
}
