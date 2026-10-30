"use client";

import * as React from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

function AuthenticatedImage({
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [objectURL, setObjectURL] = React.useState<string | null>(null);
  const [captureTimestamp, setCaptureTimestamp] = React.useState<string | null>(null);
  const [zoomed, setZoomed] = React.useState(false);
  const [zoomScale, setZoomScale] = React.useState(1);
  const imageSrc = typeof src === "string" ? src : undefined;

  React.useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    if (!imageSrc || !imageSrc.startsWith("/api/workspace/preview")) {
      setObjectURL(null);
      setCaptureTimestamp(null);
      setZoomed(false);
      setZoomScale(1);
      return () => {
        cancelled = true;
      };
    }

    const token = auth.getToken();
    setCaptureTimestamp(null);
    fetch(imageSrc, {
      credentials: "same-origin",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`图片读取失败: ${response.status}`);
        setCaptureTimestamp(response.headers.get("X-Report-Screenshot-Timestamp"));
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectURL(url);
      })
      .catch(() => {
        if (!cancelled) setObjectURL(null);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageSrc]);

  const renderedSrc = objectURL ?? imageSrc;
  const timestamp = captureTimestamp ? (
    <span className="pointer-events-none absolute right-3 top-3 whitespace-nowrap rounded-md bg-black/55 px-3 py-1.5 font-mono text-sm font-semibold text-white shadow-lg backdrop-blur-[2px]">
      {captureTimestamp}
    </span>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="relative my-2 inline-block max-w-full cursor-zoom-in rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => renderedSrc && setZoomed(true)}
        aria-label="放大查看报告截图"
      >
        <img {...props} src={renderedSrc} alt={alt || "报告截图，点击放大"} />
        {timestamp}
      </button>
      <Dialog
        open={zoomed}
        onOpenChange={(next) => {
          setZoomed(next);
          if (!next) setZoomScale(1);
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[96dvh] max-w-[96vw] items-center justify-center overflow-hidden bg-black/85 p-3 backdrop-blur-sm sm:max-w-[96vw]"
        >
          <div className="relative flex max-h-[90dvh] max-w-full items-center justify-center overflow-auto">
            <div className="relative inline-block origin-center transition-transform duration-150" style={{ transform: `scale(${zoomScale})` }}>
              <img
                src={renderedSrc}
                alt={alt || "报告截图"}
                className="max-h-[90dvh] max-w-[90vw] rounded-md object-contain"
              />
              {timestamp}
            </div>
          </div>
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg bg-black/60 p-1 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              onClick={() => setZoomScale((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
              disabled={zoomScale <= 0.5}
              title="缩小"
              aria-label="缩小图片"
            >
              <ZoomOutIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              onClick={() => setZoomScale(1)}
              disabled={zoomScale === 1}
              title="重置大小"
              aria-label="重置图片大小"
            >
              <RotateCcwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              onClick={() => setZoomScale((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
              disabled={zoomScale >= 3}
              title="放大"
              aria-label="放大图片"
            >
              <ZoomInIcon />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Tailwind-styled element overrides (no typography plugin in this project, so we
// style each element). `node` is stripped — it's not a valid DOM attribute.
const components: Components = {
  h1: ({ node, ...p }) => <div className="mt-2.5 text-base font-semibold" {...p} />,
  h2: ({ node, ...p }) => <div className="mt-2 text-sm font-semibold" {...p} />,
  h3: ({ node, ...p }) => <div className="mt-1.5 text-sm font-medium text-foreground/90" {...p} />,
  h4: ({ node, ...p }) => <div className="mt-1.5 text-sm font-medium text-foreground/90" {...p} />,
  p: ({ node, ...p }) => <p className="leading-relaxed" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold" {...p} />,
  a: ({ node, ...p }) => (
    <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
  ),
  img: ({ node, src, alt, ...p }) => {
    const resolvedSrc =
      typeof src === "string" && src.startsWith("workspace://")
        ? `/api/workspace/preview?path=${encodeURIComponent(src.slice("workspace://".length))}`
        : typeof src === "string" && src.startsWith("findings/screenshots/")
          ? `/api/workspace/preview?path=${encodeURIComponent(src)}`
        : src;
    return (
      <AuthenticatedImage
        {...p}
        className="my-2 max-h-[520px] max-w-full rounded-md border object-contain"
        src={resolvedSrc}
        alt={alt || "报告截图"}
        // Report screenshots are evidence and must be fetched while the report is
        // rendered; Edge may replace lazy images with placeholders indefinitely
        // when the markdown section is outside the initial viewport.
        loading="eager"
        decoding="async"
      />
    );
  },
  hr: () => <hr className="my-2 border-border" />,
  blockquote: ({ node, ...p }) => (
    <blockquote className="my-1 border-l-2 border-border pl-2.5 text-muted-foreground" {...p} />
  ),
  pre: ({ node, ...p }) => (
    <pre className="my-1.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/70 p-2.5 text-xs leading-relaxed [overflow-wrap:anywhere]" {...p} />
  ),
  code: ({ node, className, children, ...rest }) => {
    const block = /language-/.test(className || "");
    return block ? (
      <code className={"font-mono text-xs " + (className || "")} {...rest}>
        {children}
      </code>
    ) : (
      <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...rest}>
        {children}
      </code>
    );
  },
  table: ({ node, ...p }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-xs" {...p} />
    </div>
  ),
  th: ({ node, ...p }) => <th className="border border-border bg-muted/60 px-2 py-1 text-left font-medium" {...p} />,
  td: ({ node, ...p }) => <td className="border border-border px-2 py-1 align-top [overflow-wrap:anywhere]" {...p} />,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] space-y-1.5 text-sm [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) =>
          url.startsWith("workspace://") || url.startsWith("findings/screenshots/") ? url : defaultUrlTransform(url)
        }
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
