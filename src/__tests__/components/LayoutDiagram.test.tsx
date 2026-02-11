/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import { LayoutDiagram } from "@/components/help/LayoutDiagram";

describe("LayoutDiagram", () => {
  it("renders Chinese labels by default", () => {
    render(<LayoutDiagram />);
    expect(screen.getByText("+ 导入文档")).toBeInTheDocument();
    expect(screen.getByText("文档库")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByText("文档阅读区域")).toBeInTheDocument();
  });

  it("renders English labels when lang=en", () => {
    render(<LayoutDiagram lang="en" />);
    expect(screen.getByText("+ Import")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Reading Area")).toBeInTheDocument();
  });

  it("contains AI panel section with tabs", () => {
    render(<LayoutDiagram lang="zh" />);
    expect(screen.getByText("翻译")).toBeInTheDocument();
    expect(screen.getByText("释义")).toBeInTheDocument();
    expect(screen.getByText("对话")).toBeInTheDocument();
    expect(screen.getByText("笔记")).toBeInTheDocument();
  });

  it("contains floating toolbar with page info", () => {
    render(<LayoutDiagram />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("1/42")).toBeInTheDocument();
  });

  it("shows document file names", () => {
    const { container } = render(<LayoutDiagram />);
    expect(container.textContent).toContain("Paper.pdf");
    expect(container.textContent).toContain("Novel.epub");
    expect(container.textContent).toContain("Notes.md");
  });

  it("contains resize handle indicators", () => {
    const { container } = render(<LayoutDiagram />);
    // Two resize handles (sidebar | reading area | AI panel)
    const resizeHandles = container.querySelectorAll(".cursor-col-resize");
    expect(resizeHandles.length).toBe(2);
  });
});
