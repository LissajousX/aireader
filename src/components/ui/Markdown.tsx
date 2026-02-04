import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

interface MarkdownProps {
  children?: string | null;
  resolveImageSrc?: (src?: string) => string | undefined;
}

export function Markdown({ children, resolveImageSrc }: MarkdownProps) {
  const source = children ?? "";

  const slugify = (s: string) => {
    return s
      .toLowerCase()
      .trim()
      .replace(/[\s\u00A0]+/g, "-")
      .replace(/[^a-z0-9\-\u4e00-\u9fff]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const toText = (node: any): string => {
    if (node == null) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(toText).join("");
    if (typeof node === "object" && node.props && "children" in node.props) {
      return toText(node.props.children);
    }
    return "";
  };

  const headingIdFactory = () => {
    const counts = new Map<string, number>();
    return (text: string) => {
      const base = slugify(text) || "section";
      const c = counts.get(base) ?? 0;
      counts.set(base, c + 1);
      return c === 0 ? base : `${base}-${c + 1}`;
    };
  };
  const getHeadingId = headingIdFactory();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        h1: ({ children, ...props }) => {
          const id = getHeadingId(toText(children));
          return (
            <h1 {...props} id={id}>
              {children}
            </h1>
          );
        },
        h2: ({ children, ...props }) => {
          const id = getHeadingId(toText(children));
          return (
            <h2 {...props} id={id}>
              {children}
            </h2>
          );
        },
        h3: ({ children, ...props }) => {
          const id = getHeadingId(toText(children));
          return (
            <h3 {...props} id={id}>
              {children}
            </h3>
          );
        },
        h4: ({ children, ...props }) => {
          const id = getHeadingId(toText(children));
          return (
            <h4 {...props} id={id}>
              {children}
            </h4>
          );
        },
        h5: ({ children, ...props }) => {
          const id = getHeadingId(toText(children));
          return (
            <h5 {...props} id={id}>
              {children}
            </h5>
          );
        },
        h6: ({ children, ...props }) => {
          const id = getHeadingId(toText(children));
          return (
            <h6 {...props} id={id}>
              {children}
            </h6>
          );
        },
        img: ({ src, alt, ...props }) => (
          <img src={resolveImageSrc ? resolveImageSrc(src) : src} alt={alt || ""} {...props} />
        ),
        pre: ({ children, ...props }) => (
          <pre className="overflow-x-auto" {...props}>
            {children}
          </pre>
        ),
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto">
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
