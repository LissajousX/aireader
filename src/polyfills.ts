// Polyfill: Promise.withResolvers (ES2024) — needed for pdfjs-dist on
// older JS engines such as WebKitGTK 2.42's JavaScriptCore.
//
// IMPORTANT: This file MUST be the first import in main.tsx so that:
// 1. The polyfill is available on the main thread for all subsequent code.
// 2. The __nativePromiseWithResolvers flag is set BEFORE any component
//    module-level code runs (e.g. PDFReader.tsx worker configuration).

(window as any).__nativePromiseWithResolvers = typeof Promise.withResolvers !== "undefined";

if (typeof Promise.withResolvers === "undefined") {
  Promise.withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}
