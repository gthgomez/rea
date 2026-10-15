import { describe, expect, it } from "vitest";

import { mergedAllowedOrigins } from "./cliObservationOptions.js";

describe("mergedAllowedOrigins", () => {
  it("returns undefined when neither filter is supplied", () => {
    expect(mergedAllowedOrigins({})).toBeUndefined();
    expect(mergedAllowedOrigins({ allowedOrigin: "" })).toBeUndefined();
    expect(mergedAllowedOrigins({ allowedOrigin: " , " })).toBeUndefined();
  });

  it("splits the shell-safe scalar on commas and trims entries", () => {
    expect(
      mergedAllowedOrigins({
        allowedOrigin: "https://a.example, https://b.example,,",
      }),
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("keeps array and scalar entries in declaration order", () => {
    expect(
      mergedAllowedOrigins({
        allowedOrigins: ["https://array.example"],
        allowedOrigin: "https://scalar.example",
      }),
    ).toEqual(["https://array.example", "https://scalar.example"]);
  });

  it("passes an array-only filter through unchanged", () => {
    expect(
      mergedAllowedOrigins({ allowedOrigins: ["https://only.example"] }),
    ).toEqual(["https://only.example"]);
  });
});
