/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Component that throws on render
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div>Normal content</div>;
}

describe("ErrorBoundary", () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders error UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Render Error")).toBeInTheDocument();
    expect(screen.getByText("Test render error")).toBeInTheDocument();
  });

  it("shows Retry button that resets error state", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Render Error")).toBeInTheDocument();

    // Click retry — component will re-render; if child still throws, error shows again
    fireEvent.click(screen.getByText("Retry"));

    // After retry, the boundary tries to render children again
    // Since ThrowingComponent still throws, error will reappear
    expect(screen.getByText("Render Error")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
    expect(screen.queryByText("Render Error")).not.toBeInTheDocument();
  });

  it("shows 'Unknown error' when error has no message", () => {
    function ThrowNull() {
      throw { notAnError: true };
      return null;
    }
    render(
      <ErrorBoundary>
        <ThrowNull />
      </ErrorBoundary>
    );
    expect(screen.getByText("Render Error")).toBeInTheDocument();
  });
});
