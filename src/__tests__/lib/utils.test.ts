/// <reference types="vitest/globals" />
import { cn, getErrorMessage } from "@/lib/utils";

describe("cn (className merge)", () => {
  it("merges basic classes", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("deduplicates conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error instance", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns string as-is", () => {
    expect(getErrorMessage("something failed")).toBe("something failed");
  });

  it("extracts .message from plain object", () => {
    expect(getErrorMessage({ message: "obj err" })).toBe("obj err");
  });

  it("extracts .error from plain object when .message is missing", () => {
    expect(getErrorMessage({ error: "fallback err" })).toBe("fallback err");
  });

  it("prefers .message over .error", () => {
    expect(getErrorMessage({ message: "primary", error: "secondary" })).toBe("primary");
  });

  it("JSON-stringifies objects without message/error", () => {
    expect(getErrorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it("handles number input", () => {
    expect(getErrorMessage(404)).toBe("404");
  });

  it("handles null", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("handles undefined", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("ignores empty .message string", () => {
    expect(getErrorMessage({ message: "  ", error: "real" })).toBe("real");
  });
});
