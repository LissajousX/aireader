import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction: "left" | "right";
  className?: string;
}

export function ResizeHandle({ onResize, direction, className }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === "left" 
        ? startX - e.clientX 
        : e.clientX - startX;
      onResize(delta);
      setStartX(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, startX, direction, onResize]);

  return (
    <div
      className={cn(
        "w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
        isDragging && "bg-primary",
        className
      )}
      onMouseDown={handleMouseDown}
    />
  );
}
