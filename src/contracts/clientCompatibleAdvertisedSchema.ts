const isSchemaNode = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonTypeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};

/** Keywords whose values are caller data rather than schema structure. */
const DATA_BEARING_KEYWORDS = new Set(["examples", "default"]);

const relaxNonStringSelection = (
  node: Record<string, unknown>,
): Record<string, unknown> => {
  if (Array.isArray(node.enum)) {
    const members = node.enum as unknown[];
    if (members.some((member) => typeof member !== "string")) {
      const { enum: _removed, ...rest } = node;
      const types = new Set(members.map(jsonTypeOf));
      if (rest.type === undefined && types.size === 1)
        rest.type = [...types][0];
      return rest;
    }
  }
  if (node.const !== undefined && typeof node.const !== "string") {
    const { const: _removed, ...rest } = node;
    if (rest.type === undefined) rest.type = jsonTypeOf(node.const);
    return rest;
  }
  return node;
};

const normalizeNode = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map((entry) => normalizeNode(entry));
  if (!isSchemaNode(node)) return node;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node))
    normalized[key] =
      key === "$ref" || DATA_BEARING_KEYWORDS.has(key)
        ? value
        : normalizeNode(value);
  return relaxNonStringSelection(normalized);
};

/**
 * Strict advertised-schema profiles (the Gemini tool-catalog profile that
 * rejects the whole catalog on this shape) require every enum and const
 * member to be a string. One non-string member therefore downgrades the
 * keyword to its JSON type; canonical Zod validation still enforces the
 * exact accepted values at the application boundary.
 */
export const normalizeAdvertisedInputSchemaForClientCompatibility = (
  projected: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized = normalizeNode(projected);
  return isSchemaNode(normalized) ? normalized : projected;
};
