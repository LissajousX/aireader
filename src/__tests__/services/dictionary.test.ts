/// <reference types="vitest/globals" />
import { isSingleCJKWord, isSingleWord } from "@/services/dictionary";

describe("isSingleCJKWord", () => {
  it("returns true for single Chinese character", () => {
    expect(isSingleCJKWord("你")).toBe(true);
  });

  it("returns true for multi-char Chinese word", () => {
    expect(isSingleCJKWord("学习")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isSingleCJKWord("")).toBe(false);
  });

  it("returns false for whitespace only", () => {
    expect(isSingleCJKWord("  ")).toBe(false);
  });

  it("returns false for English text", () => {
    expect(isSingleCJKWord("hello")).toBe(false);
  });

  it("returns false for mixed CJK and English", () => {
    expect(isSingleCJKWord("你好world")).toBe(false);
  });

  it("returns false for CJK with spaces", () => {
    expect(isSingleCJKWord("你 好")).toBe(false);
  });

  it("returns false for strings longer than 20 chars", () => {
    expect(isSingleCJKWord("你".repeat(21))).toBe(false);
  });

  it("returns true for exactly 20 CJK chars", () => {
    expect(isSingleCJKWord("你".repeat(20))).toBe(true);
  });

  it("trims whitespace before checking", () => {
    expect(isSingleCJKWord("  学习  ")).toBe(true);
  });

  it("returns false for CJK with punctuation", () => {
    expect(isSingleCJKWord("你好！")).toBe(false);
  });
});

describe("isSingleWord", () => {
  it("returns true for simple English word", () => {
    expect(isSingleWord("hello")).toBe(true);
  });

  it("returns true for hyphenated word", () => {
    expect(isSingleWord("well-known")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isSingleWord("")).toBe(false);
  });

  it("returns false for multi-word text", () => {
    expect(isSingleWord("hello world")).toBe(false);
  });

  it("returns false for text with numbers", () => {
    expect(isSingleWord("abc123")).toBe(false);
  });

  it("returns false for text longer than 30 chars", () => {
    expect(isSingleWord("a".repeat(31))).toBe(false);
  });

  it("returns true for exactly 30 chars", () => {
    expect(isSingleWord("a".repeat(30))).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isSingleWord("  hello  ")).toBe(true);
  });

  it("returns false for double-hyphenated", () => {
    expect(isSingleWord("a-b-c")).toBe(false);
  });

  it("returns true for uppercase", () => {
    expect(isSingleWord("Hello")).toBe(true);
  });
});
