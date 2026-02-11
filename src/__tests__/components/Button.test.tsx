/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("fires onClick handler", () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText("Disabled")).toBeDisabled();
  });

  it("applies variant classes", () => {
    const { container } = render(<Button variant="destructive">Delete</Button>);
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("bg-destructive");
  });

  it("applies size classes", () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("h-9");
  });

  it("applies custom className", () => {
    const { container } = render(<Button className="my-custom">Custom</Button>);
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("my-custom");
  });

  it("renders as button element", () => {
    const { container } = render(<Button>Test</Button>);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("forwards ref", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
