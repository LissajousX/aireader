// Polyfills MUST be the very first import so they run before any component
// module-level code (e.g. PDFReader's pdfjs worker configuration).
import "./polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
import "./index.css";

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
