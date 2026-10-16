import { describe, it, expect } from "vitest";
import { normalizeSettings, DEFAULTS } from "../src/shared/settings.js";

describe("normalizeSettings", () => {
  it("fills defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULTS);
    expect(normalizeSettings({})).toEqual(DEFAULTS);
  });
  it("clamps and cleans", () => {
    const s = normalizeSettings({
      duration: "99999",
      region: " EU-West-1 ",
      os: "weird",
      profilePattern: "",
      templates: "x",
    });
    expect(s.duration).toBe(43200);
    expect(s.region).toBe("eu-west-1");
    expect(s.os).toBe("sh");
    expect(s.profilePattern).toBe("{account}-{role}");
    expect(s.templates).toEqual([]);
    expect(normalizeSettings({ duration: "abc" }).duration).toBe("saml");
    expect(normalizeSettings({ duration: 10 }).duration).toBe(900);
  });
  it("keeps only complete templates, capped", () => {
    const s = normalizeSettings({
      templates: [
        { name: "a", body: "b" },
        { name: "", body: "x" },
        { name: "c" },
        null,
      ],
    });
    expect(s.templates).toEqual([{ name: "a", body: "b" }]);
  });
});
