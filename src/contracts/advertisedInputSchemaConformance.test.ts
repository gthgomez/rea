import { describe, expect, it } from "vitest";

import { TOOL_CONTRACTS } from "./toolContracts.js";
import { advertisedInputJsonSchema } from "./toolSchemaMetadata.js";

const DATA_BEARING_KEYWORDS = new Set(["examples", "default"]);

const collectNonStringSelections = (
  schema: unknown,
  tool: string,
  path: string,
  violations: string[],
): void => {
  if (Array.isArray(schema)) {
    schema.forEach((entry, index) =>
      collectNonStringSelections(entry, tool, `${path}[${index}]`, violations),
    );
    return;
  }
  if (schema === null || typeof schema !== "object") return;
  const node = schema as Record<string, unknown>;
  if (Array.isArray(node.enum)) {
    const nonString = (node.enum as unknown[]).filter(
      (member) => typeof member !== "string",
    );
    if (nonString.length > 0)
      violations.push(`${tool} ${path} enum ${JSON.stringify(nonString)}`);
  }
  if (node.const !== undefined && typeof node.const !== "string")
    violations.push(`${tool} ${path} const ${JSON.stringify(node.const)}`);
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" || DATA_BEARING_KEYWORDS.has(key)) continue;
    collectNonStringSelections(value, tool, `${path}/${key}`, violations);
  }
};

describe("advertised input schemas", () => {
  it("advertise only strict-client-compatible enum and const values", () => {
    const violations: string[] = [];
    for (const contract of TOOL_CONTRACTS)
      collectNonStringSelections(
        advertisedInputJsonSchema(contract),
        contract.name,
        "",
        violations,
      );
    expect(violations).toEqual([]);
  });

  it("project every advertised input schema as serializable JSON", () => {
    for (const contract of TOOL_CONTRACTS) {
      const schema = advertisedInputJsonSchema(contract);
      expect(() => JSON.stringify(schema)).not.toThrow();
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    }
  });
});
