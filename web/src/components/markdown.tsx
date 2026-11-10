"use client";
import * as React from "react";

import { RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

function AuthenticatedImage({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { ui, liveUI } = useUITranslation();

  const [objectURL, setObjectURL] = React.useState<string | null>(null);
  const [captureTimestamp, setCaptureTimestamp] = React.useState<string | null>(null);
  const [zoomed, setZoomed] = React.useState(false);
  const [zoomScale, setZoomScale] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const dragRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imageSrc = typeof src === "string" ? src : undefined;

  React.useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    if (!imageSrc || !imageSrc.startsWith("/api/workspace/preview")) {
      setObjectURL(null);
      setCaptureTimestamp(null);
      setZoomed(false);
      setZoomScale(1);
      setPan({ x: 0, y: 0 });
      return () => {
        cancelled = true;
      };
    }

    const token = auth.getToken();
    setCaptureTimestamp(null);
    apiFetch(imageSrc, {
      credentials: "same-origin",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => {
        if (!response.ok) throw new Error(liveUI("screen.3cb4ca5e3686db", { v0: response.status }));
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
  }, [imageSrc, liveUI]);

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
        aria-label={ui("screen.c0f272b3250d7d")}
      >
        <img
          {...props}
          src={renderedSrc}
          alt={alt || ui("screen.1d1ee9f8536a82")}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
        {timestamp}
      </button>
      <Dialog
        open={zoomed}
        onOpenChange={(next) => {
          setZoomed(next);
          if (!next) {
            setZoomScale(1);
            setPan({ x: 0, y: 0 });
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[96dvh] max-w-[96vw] items-center justify-center overflow-hidden bg-black/85 p-3 backdrop-blur-sm sm:max-w-[96vw]"
        >
          <div
            className="relative flex h-[90dvh] w-[90vw] max-w-full items-center justify-center overflow-hidden"
            onPointerDown={(event) => {
              if (zoomScale <= 1 || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
            }}
            onPointerUp={(event) => {
              dragRef.current = null;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            style={{ cursor: zoomScale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
          >
            <div
              className="relative inline-block origin-center"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})` }}
            >
              <img
                src={renderedSrc}
                alt={alt || ui("screen.9ed32db8d64833")}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className="max-h-[90dvh] max-w-[90vw] rounded-md object-contain"
              />
              {timestamp}
            </div>
          </div>
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg bg-black/60 p-1 backdrop-blur-sm">
            <span className="px-2 text-xs font-medium text-white tabular-nums">{Math.round(zoomScale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              onClick={() => setZoomScale((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
              disabled={zoomScale <= 0.5}
              title={ui("screen.290f68030501cd")}
              aria-label={ui("screen.c655cffc7e83ee")}
            >
              <ZoomOutIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              onClick={() => setZoomScale(1)}
              disabled={zoomScale === 1}
              title={ui("screen.cac21ee48d7687")}
              aria-label={ui("screen.bfe737d41bd9d0")}
            >
              <RotateCcwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              onClick={() => setZoomScale((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
              disabled={zoomScale >= 3}
              title={ui("screen.80f8fbcfa01176")}
              aria-label={ui("screen.c4189466c4c406")}
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
const components = (ui: UITranslate): Components => ({
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
        alt={alt || ui("screen.9ed32db8d64833")}
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
    <pre
      className="my-1.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/70 p-2.5 text-xs leading-relaxed [overflow-wrap:anywhere]"
      {...p}
    />
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
});

export function Markdown({ text }: { text: string }) {
  const { ui } = useUITranslation();

  return (
    <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] space-y-1.5 text-sm [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components(ui)}
        urlTransform={(url) =>
          url.startsWith("workspace://") || url.startsWith("findings/screenshots/") ? url : defaultUrlTransform(url)
        }
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
