/// <reference types="vitest/globals" />
import { formatModelSize } from "@/services/ollamaApi";

describe("formatModelSize", () => {
  it("formats bytes < 1GB as MB", () => {
    expect(formatModelSize(500 * 1024 * 1024)).toBe("500 MB");
  });

  it("formats bytes >= 1GB as GB with 1 decimal", () => {
    expect(formatModelSize(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("formats exactly 1GB", () => {
    expect(formatModelSize(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("formats small values as MB", () => {
    expect(formatModelSize(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("formats 0 bytes as 0 MB", () => {
    expect(formatModelSize(0)).toBe("0 MB");
  });
});
