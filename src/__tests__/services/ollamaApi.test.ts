/// <reference types="vitest/globals" />
import { formatModelSize, fetchOllamaModels, testOllamaConnection } from "@/services/ollamaApi";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("fetchOllamaModels", () => {
  it("returns model list from invoke", async () => {
    const models = [{ name: "llama3:8b", modified_at: "2025-01-01", size: 4_000_000_000 }];
    mockInvoke.mockResolvedValueOnce(models);

    const result = await fetchOllamaModels("http://localhost:11434");
    expect(result).toEqual(models);
    expect(mockInvoke).toHaveBeenCalledWith("ollama_list_models", { baseUrl: "http://localhost:11434" });
  });

  it("returns empty array on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("connection refused"));

    const result = await fetchOllamaModels("http://localhost:11434");
    expect(result).toEqual([]);
  });
});

describe("testOllamaConnection", () => {
  it("returns true when connected", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const result = await testOllamaConnection("http://localhost:11434");
    expect(result).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("ollama_test_connection", { baseUrl: "http://localhost:11434" });
  });

  it("returns false on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("timeout"));

    const result = await testOllamaConnection("http://localhost:11434");
    expect(result).toBe(false);
  });
});

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
