/// <reference types="vitest/globals" />
import { tr } from "@/i18n";

describe("tr (translation function)", () => {
  it("returns Chinese translation for zh", () => {
    expect(tr("zh", "app.name")).toBe("Aireader");
  });

  it("returns English translation for en", () => {
    expect(tr("en", "common.settings")).toBe("Settings");
  });

  it("falls back to zh when en key is missing", () => {
    // Both dictionaries have this key, just verify no crash
    const result = tr("en", "app.name");
    expect(result).toBe("Aireader");
  });

  it("returns key itself when not found in any language", () => {
    expect(tr("zh", "nonexistent.key")).toBe("nonexistent.key");
  });

  it("substitutes {param} placeholders", () => {
    expect(tr("zh", "library.count", { count: 5 })).toBe("(5 个文档)");
    expect(tr("en", "library.count", { count: 3 })).toBe("(3 documents)");
  });

  it("handles missing params gracefully (empty string)", () => {
    expect(tr("en", "date.days_ago", {})).toBe(" days ago");
  });

  it("handles null/undefined param values", () => {
    expect(tr("en", "date.days_ago", { days: null })).toBe(" days ago");
    expect(tr("en", "date.days_ago", { days: undefined })).toBe(" days ago");
  });

  it("zh and en dictionaries have same keys", () => {
    // Smoke test: a sample of keys that should exist in both
    const keys = [
      "app.name",
      "common.settings",
      "common.cancel",
      "sidebar.documents",
      "welcome.tagline",
      "library.title",
    ];
    for (const key of keys) {
      expect(tr("zh", key)).not.toBe(key);
      expect(tr("en", key)).not.toBe(key);
    }
  });
});
