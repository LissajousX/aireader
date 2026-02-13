import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
import "./index.css";

// Polyfill: Promise.withResolvers (ES2024) — needed for pdfjs-dist on
// older JS engines such as WebKitGTK 2.42's JavaScriptCore.
// Also record whether the native API existed BEFORE polyfilling, so
// PDFReader can decide whether to use a Web Worker (workers don't get
// our polyfill, so we must fall back to main-thread parsing there).
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

// Apply saved theme before first paint
(() => {
  const theme = localStorage.getItem('aireader_theme') || 'system';
  const root = document.documentElement;
  if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
