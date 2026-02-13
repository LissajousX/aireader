// Polyfill: Promise.withResolvers (ES2024) — needed for pdfjs-dist on
// older JS engines such as WebKitGTK 2.42's JavaScriptCore.
//
// IMPORTANT: This file MUST be the first import in main.tsx so that:
// 1. The polyfill is available on the main thread for all subsequent code.
// 2. The PDF worker is pre-loaded on the main thread BEFORE any component
//    tries to use pdfjs (see __pdfWorkerReady below).

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

  // Pre-load the PDF worker module on the main thread.
  // Without this, pdfjs creates a real Web Worker which passes the initial
  // handshake but crashes later during PDF parsing when it calls
  // Promise.withResolvers (the polyfill only exists on the main thread).
  // By setting globalThis.pdfjsWorker, pdfjs detects the pre-loaded handler
  // and skips creating a real Worker entirely, using "fake worker" mode instead.
  const workerUrl = "/pdf.worker.min.mjs";
  (window as any).__pdfWorkerReady = import(/* @vite-ignore */ workerUrl).then(mod => {
    (globalThis as any).pdfjsWorker = mod;
  });
} else {
  (window as any).__pdfWorkerReady = Promise.resolve();
}
