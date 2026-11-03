import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url)));

describe("module.json", () => {
  it("targets only the pf2e system", () => {
    expect(manifest.relationships.systems.map((s) => s.id)).toEqual(["pf2e"]);
  });
  it("references files that exist", () => {
    for (const p of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path)]) {
      expect(existsSync(new URL(`../${p}`, import.meta.url)), p).toBe(true);
    }
  });
});
