// Type declaration for Promise.withResolvers (ES2024 polyfill)
// Needed because our tsconfig targets ES2020 but pdfjs-dist uses this API.
interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

interface PromiseConstructor {
  withResolvers<T>(): PromiseWithResolvers<T>;
}
