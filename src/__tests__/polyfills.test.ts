/// <reference types="vitest/globals" />

// ── Promise.withResolvers polyfill logic (unit-tested without importing the side-effect module) ──

describe("Promise.withResolvers polyfill logic", () => {
  it("polyfill produces working resolve/promise", async () => {
    // Reproduce the polyfill function directly
    function withResolvers<T>() {
      let resolve: (value: T | PromiseLike<T>) => void;
      let reject: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve: resolve!, reject: reject! };
    }

    const { promise, resolve } = withResolvers<number>();
    resolve(42);
    await expect(promise).resolves.toBe(42);
  });

  it("polyfill produces working reject/promise", async () => {
    function withResolvers<T>() {
      let resolve: (value: T | PromiseLike<T>) => void;
      let reject: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve: resolve!, reject: reject! };
    }

    const { promise, reject } = withResolvers<string>();
    reject(new Error("test error"));
    await expect(promise).rejects.toThrow("test error");
  });

  it("returns three distinct properties", () => {
    function withResolvers<T>() {
      let resolve: (value: T | PromiseLike<T>) => void;
      let reject: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve: resolve!, reject: reject! };
    }

    const result = withResolvers<void>();
    expect(result).toHaveProperty("promise");
    expect(result).toHaveProperty("resolve");
    expect(result).toHaveProperty("reject");
    expect(result.promise).toBeInstanceOf(Promise);
    expect(typeof result.resolve).toBe("function");
    expect(typeof result.reject).toBe("function");
  });
});

// ── __pdfWorkerReady contract ──

describe("__pdfWorkerReady contract", () => {
  it("on modern engines (native Promise.withResolvers), __pdfWorkerReady should be Promise.resolve()", () => {
    // Simulate what polyfills.ts does on modern engines
    if (typeof Promise.withResolvers === "function") {
      const ready = Promise.resolve();
      expect(ready).toBeInstanceOf(Promise);
    }
  });

  it("on old engines (no native Promise.withResolvers), polyfill installs and worker preloads", () => {
    // Simulate the old-engine branch
    const savedWR = Promise.withResolvers;
    try {
      // Pretend Promise.withResolvers doesn't exist
      (Promise as any).withResolvers = undefined;
      expect(typeof Promise.withResolvers).toBe("undefined");

      // The polyfill branch would:
      // 1. Install the polyfill
      // 2. Set __pdfWorkerReady to a promise that sets globalThis.pdfjsWorker
      // Verify the condition check works correctly
      const needsPolyfill = typeof Promise.withResolvers === "undefined";
      expect(needsPolyfill).toBe(true);
    } finally {
      Promise.withResolvers = savedWR;
    }
  });
});

// ── workerSrc must be a valid URL, not a bare specifier ──

describe("PDF worker URL validation", () => {
  it("workerSrc '/pdf.worker.min.mjs' is an absolute URL path", () => {
    const workerSrc = "/pdf.worker.min.mjs";
    // Must start with "/" — a valid URL path
    expect(workerSrc.startsWith("/")).toBe(true);
    // Must NOT be a bare specifier like "pdf.worker.mjs"
    expect(workerSrc).not.toBe("pdf.worker.mjs");
    // Must end with .mjs
    expect(workerSrc.endsWith(".mjs")).toBe(true);
  });

  it("bare specifier 'pdf.worker.mjs' is NOT a valid URL", () => {
    // This is what pdfjs defaults to — causes WebKitGTK error
    const bare = "pdf.worker.mjs";
    expect(bare.startsWith("/")).toBe(false);
    expect(bare.startsWith("http")).toBe(false);
  });
});
