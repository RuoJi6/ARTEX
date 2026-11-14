"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  Building03Icon,
  Cancel01Icon,
  CommandIcon,
  DeliveryTruck01Icon,
  FileExclamationPointIcon,
  GridViewIcon,
  Logout03Icon,
  Menu01Icon,
  MoreHorizontalIcon,
  BellIcon,
  Search01Icon,
  Settings01Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setEdges({
      start: scrollTop > 1,
      end: Math.ceil(scrollTop + clientHeight) < scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  return { ref, edges, onScroll: update };
}

const canvas = "bg-rb-canvas";
const pageFog = "bg-rb-subtle dark:bg-rb-canvas";
const backdrop = "bg-rb-overlay";
const brandMark =
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--rb-r-sm,6px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] select-none dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const ruleTop = "border-t border-rb-line";
const overlayShadow =
  "shadow-rb-overlay";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const typeCodeSm = "font-mono text-[12px]/[16px] tabular-nums";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const ghostButtonMuted =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg/80 hover:not-disabled:bg-rb-soft hover:not-disabled:text-rb-fg active:bg-rb-soft aria-expanded:bg-rb-soft aria-expanded:text-rb-fg disabled:text-rb-muted/60 dark:text-rb-fg/80 dark:hover:not-disabled:bg-rb-soft dark:hover:not-disabled:text-rb-fg dark:active:bg-rb-soft dark:aria-expanded:bg-rb-soft dark:aria-expanded:text-rb-fg dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const buttonLg =
  "h-11 gap-2 rounded-[var(--rb-r-sm,6px)] px-5 text-[16px]/[20px] font-[450] tracking-[-0.01em]";
const iconButtonMd = "size-8 rounded-[var(--rb-r-sm,6px)]";
const inputBox =
  "relative flex w-full min-w-0 cursor-text items-center rounded-[var(--rb-r-sm,6px)] data-concentric:rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-[14px]/[16px] font-[450] text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line has-[[aria-invalid=true]]:border-[oklch(60%_0.236_26)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-rb-line has-[input:disabled]:text-rb-muted/60 has-[input:disabled]:shadow-none has-[input[readonly]]:cursor-default has-[input[readonly]]:border-transparent has-[input[readonly]]:bg-rb-soft has-[input[readonly]]:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line dark:has-[[aria-invalid=true]]:border-[oklch(65.2%_0.219_26)] dark:has-[input:disabled]:border-rb-line dark:has-[input:disabled]:text-rb-muted/60 dark:has-[input[readonly]]:bg-rb-soft";
const fieldMd = "h-8";
const inputControl =
  "h-full w-full min-w-0 flex-1 bg-transparent px-3 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const inputAffix =
  "flex shrink-0 items-center gap-2 text-[14px]/[16px] text-rb-muted select-none first:ps-3 last:pe-3 has-[button]:first:ps-1 has-[button]:last:pe-1";
const statusWord =
  "inline-flex items-start gap-1.5 text-[14px]/[16px] font-[450] tabular-nums";
const statusWordSm =
  "inline-flex items-start gap-1 text-[13px]/[18px] font-[450] tabular-nums";
const statusQueued = "text-rb-fg";
const statusRunning = "text-rb-fg";
const statusOk = "text-rb-fg/80";
const statusWarn = "text-[oklch(49%_0.1_68)] dark:text-[oklch(80%_0.13_68)]";
const statusFail = "text-[oklch(51%_0.18_26)] dark:text-[oklch(76%_0.14_26)]";
const arcLine = "flex h-lh shrink-0 items-center";
const runningArc =
  "inline-block size-2.5 shrink-0 rounded-full border border-current border-t-transparent animate-spin motion-reduce:animate-none";
const avatar =
  "relative inline-flex size-8 shrink-0 overflow-hidden rounded-full select-none";
const avatarFallback =
  "flex size-full items-center justify-center rounded-[inherit] border border-rb-line bg-rb-popover text-[12px]/[16px] font-[450] tabular-nums text-rb-fg";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const statGroup =
  "@container rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover";
const statGrid =
  "grid grid-cols-2 overflow-hidden [&>:last-child:nth-child(odd)]:col-span-full *:-mt-px *:-ml-px *:border-t *:border-l *:border-rb-line @md:grid-flow-col @md:grid-cols-none @md:auto-cols-fr @md:[&>:last-child:nth-child(odd)]:col-auto dark:*:border-rb-line";
const statCell = "flex min-w-0 flex-col gap-2 px-4 py-3";
const statLabel =
  "text-[14px]/[16px] font-[450] text-rb-fg/80";
const statValue =
  "flex min-w-0 flex-wrap items-baseline gap-x-1 text-[32px]/[36px] font-[450] tabular-nums text-rb-fg";
const statDescription =
  "text-[13px]/[18px] text-rb-muted";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const overlayEnter =
  "transition-opacity duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] starting:opacity-0 motion-reduce:transition-none";
const sidebarSurface =
  "border-r border-rb-line bg-rb-canvas dark:border-rb-line dark:bg-rb-popover";
const navItem =
  "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 text-left text-[14px]/[16px] font-[450] text-rb-fg/80 transition-[background-color,color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] [&_svg]:shrink-0 hover:bg-rb-soft hover:text-rb-fg aria-[current=page]:bg-rb-soft aria-[current=page]:text-rb-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:bg-rb-soft dark:hover:text-rb-fg dark:aria-[current=page]:bg-rb-soft dark:aria-[current=page]:text-rb-fg";
const navCount =
  "ms-auto text-[12px]/[16px] font-[450] tabular-nums text-rb-muted";
const navGroupLabel =
  "px-2 pt-4 pb-1 text-[12px]/[16px] font-normal tabular-nums text-rb-muted";
const topBar =
  "border-b border-rb-line bg-rb-canvas dark:border-rb-line dark:bg-rb-popover";
const breadcrumbList =
  "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px]/[16px] font-[450] text-rb-fg/80";
const breadcrumbLink =
  "rounded-[var(--rb-r-sm,6px)] hover:text-rb-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:text-rb-fg";
const breadcrumbCurrent = "text-rb-fg";
const breadcrumbSeparator =
  "text-rb-muted select-none";
const disclosureCaret =
  "shrink-0 text-rb-muted transition-transform duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none group-aria-expanded:rotate-90";
const table =
  "w-full border-separate border-spacing-0 text-left text-[14px]/[20px]";
const tableHead =
  "h-8 border-b border-rb-line px-3 text-left align-middle text-[12px]/[16px] font-normal tabular-nums whitespace-nowrap text-rb-muted first:ps-4 last:pe-4 dark:border-rb-line";
const tableRow =
  "group transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-selected:bg-rb-soft aria-selected:bg-rb-soft dark:hover:not-aria-selected:bg-rb-soft dark:aria-selected:bg-rb-soft";
const tableCell =
  "h-10 border-b border-rb-line px-3 align-middle whitespace-nowrap text-rb-fg group-last:border-b-0 first:ps-4 last:pe-4 dark:border-rb-line";
const numericCell = "text-right tabular-nums";
const fadeTopOnPaper =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeTopOnTray =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeBottomOnPaper =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeBottomOnTray =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";

const shipmentViews = [
  { label: "In transit", current: true },
  { label: "Awaiting pickup", current: false },
  { label: "Delivered", current: false },
  { label: "Cancelled", current: false },
];

const facilities = [
  { name: "Newark distribution centre", needsAttention: false },
  { name: "Memphis sortation hub", needsAttention: false },
  { name: "Fresno cross-dock", needsAttention: true },
  { name: "Laredo border yard", needsAttention: false },
  { name: "Rotterdam gateway", needsAttention: false },
];

const footerLinks: { label: string; icon: IconSvgElement }[] = [
  { label: "Workspace settings", icon: Settings01Icon },
  { label: "Invite teammate", icon: UserAdd01Icon },
  { label: "Documentation", icon: BookOpen01Icon },
];

const accountMenu: { label: string; icon: IconSvgElement }[] = [
  { label: "Account settings", icon: Settings01Icon },
  { label: "Notification preferences", icon: BellIcon },
  { label: "Keyboard shortcuts", icon: CommandIcon },
  { label: "Sign out", icon: Logout03Icon },
];

const metrics = [
  { label: "On-time delivery", value: "94.2%", delta: "+1.8 pts vs last week" },
  { label: "Shipments in transit", value: "1,284", delta: "+96 vs last week" },
  {
    label: "Average transit time",
    value: "3.4 days",
    delta: "\u22120.2 days vs last week",
  },
  { label: "Open claims", value: "6", delta: "+2 vs last week" },
];

type Status = "In transit" | "Awaiting pickup" | "Delivered" | "Held";

type Shipment = {
  reference: string;
  consignee: string;
  carrier: string | null;
  status: Status;
  eta: string;
  value: string;
};

const shipments: Shipment[] = [
  {
    reference: "SHP-40912",
    consignee: "Brightwater Municipal Utilities District",
    carrier: "Ardent Freightways",
    status: "In transit",
    eta: "Aug 11",
    value: "$42,180",
  },
  {
    reference: "SHP-40908",
    consignee: "Kettleworth Foods",
    carrier: "Novara Lines",
    status: "In transit",
    eta: "Aug 11",
    value: "$8,940",
  },
  {
    reference: "SHP-40901",
    consignee: "Halverson Marine Supply",
    carrier: "Ardent Freightways",
    status: "Held",
    eta: "Aug 13",
    value: "$17,620",
  },
  {
    reference: "SHP-40897",
    consignee: "Pinegrove Cabinetry",
    carrier: null,
    status: "Awaiting pickup",
    eta: "Aug 12",
    value: "$3,410",
  },
  {
    reference: "SHP-40892",
    consignee: "Corsair Metalworks",
    carrier: "Trellis Logistics",
    status: "In transit",
    eta: "Aug 12",
    value: "$26,750",
  },
  {
    reference: "SHP-40886",
    consignee: "Delacroix Paper",
    carrier: "Novara Lines",
    status: "In transit",
    eta: "Aug 13",
    value: "$6,205",
  },
  {
    reference: "SHP-40881",
    consignee: "Oakhaven Brewing",
    carrier: "Trellis Logistics",
    status: "Delivered",
    eta: "Aug 8",
    value: "$11,340",
  },
  {
    reference: "SHP-40877",
    consignee: "Stellamar Seafood",
    carrier: "Ardent Freightways",
    status: "In transit",
    eta: "Aug 14",
    value: "$19,880",
  },
  {
    reference: "SHP-40870",
    consignee: "Vandergrift Tooling",
    carrier: "Meridian Carriers",
    status: "Awaiting pickup",
    eta: "Aug 14",
    value: "$4,960",
  },
  {
    reference: "SHP-40864",
    consignee: "Cloudbank Textiles",
    carrier: "Novara Lines",
    status: "In transit",
    eta: "Aug 15",
    value: "$9,275",
  },
  {
    reference: "SHP-40859",
    consignee: "Rowanberry Organics",
    carrier: "Trellis Logistics",
    status: "Delivered",
    eta: "Aug 9",
    value: "$2,830",
  },
  {
    reference: "SHP-40851",
    consignee: "Ferris Point Aggregates",
    carrier: "Meridian Carriers",
    status: "In transit",
    eta: "Aug 15",
    value: "$31,470",
  },
  {
    reference: "SHP-40846",
    consignee: "Windhollow Instruments",
    carrier: "Ardent Freightways",
    status: "In transit",
    eta: "Aug 16",
    value: "$7,690",
  },
  {
    reference: "SHP-40840",
    consignee: "Juniper Hollow Distillery",
    carrier: "Meridian Carriers",
    status: "In transit",
    eta: "Aug 16",
    value: "$5,120",
  },
];

const statusTone: Record<Status, string> = {
  "In transit": statusRunning,
  "Awaiting pickup": statusQueued,
  Delivered: statusOk,
  Held: statusFail,
};

function StatusCell({ status }: { status: Status }) {
  return (
    <span className={cx(statusWord, statusTone[status], "whitespace-nowrap")}>
      {status === "In transit" && (
        <span className={arcLine}>
          <span aria-hidden="true" className={runningArc} />
        </span>
      )}
      {status}
    </span>
  );
}

function SidebarBody({ onClose }: { onClose?: () => void }) {
  const {
    ref: navRef,
    edges: navEdges,
    onScroll: onNavScroll,
  } = useScrollFade<HTMLElement>();
  const [shipmentsOpen, setShipmentsOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountShown, setAccountShown] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const shipmentsId = useId();

  const closeAccount = (restoreFocus: boolean) => {
    setAccountOpen(false);
    setAccountShown(false);
    if (restoreFocus) accountTriggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!accountOpen) return;
    const node = footerRef.current;
    const doc = node?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => {
      setAccountShown(true);
      accountMenuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    });

    const onPointerDown = (event: Event) => {
      if (!node?.contains(event.target as Node)) closeAccount(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(
        accountMenuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]',
        ) ?? [],
      );
      if (items.length === 0) return;
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeAccount(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[index < 0 || index === items.length - 1 ? 0 : index + 1]?.focus({
          preventScroll: true,
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[index <= 0 ? items.length - 1 : index - 1]?.focus({
          preventScroll: true,
        });
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus({ preventScroll: true });
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus({ preventScroll: true });
      } else if (event.key === "Tab") {
        closeAccount(false);
      }
    };

    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 pl-3 pr-2">
        <span aria-hidden="true" className={cx(brandMark, "size-8", typeLabel)}>
          O
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx(typeLabel, "truncate")}>Overland</p>
          <p className={cx(typeCaption, text3, "truncate")}>
            Freight operations
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Workspace options"
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <nav
          ref={navRef}
          onScroll={onNavScroll}
          aria-label="Primary"
          className="h-full overflow-y-auto px-2 pb-3"
        >
          <div>
            <p className={navGroupLabel}>Operations</p>
            <ul className="space-y-0.5">
              <li>
                <a href="#dispatch-board" className={navItem}>
                  <HugeiconsIcon
                    icon={GridViewIcon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    Dispatch board
                  </span>
                </a>
              </li>

              <li>
                <button
                  type="button"
                  aria-expanded={shipmentsOpen}
                  aria-controls={shipmentsId}
                  onClick={() => setShipmentsOpen((open) => !open)}
                  className={cx(navItem, "group")}
                >
                  <HugeiconsIcon
                    icon={DeliveryTruck01Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-left">
                    Shipments
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={disclosureCaret}
                  />
                </button>
                <div
                  id={shipmentsId}
                  className={cx(
                    "grid",
                    shipmentsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <ul
                    className={cx(
                      "-mx-1 min-h-0 space-y-0.5 overflow-hidden px-1",
                      shipmentsOpen && "pt-0.5",
                    )}
                  >
                    {shipmentViews.map((view) => (
                      <li
                        key={view.label}
                        className={shipmentsOpen ? undefined : "invisible"}
                      >
                        <a
                          href="#shipments"
                          tabIndex={shipmentsOpen ? undefined : -1}
                          aria-current={view.current ? "page" : undefined}
                          className={cx(navItem, "pl-8")}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {view.label}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>

              <li>
                <a href="#claims" className={navItem}>
                  <HugeiconsIcon
                    icon={FileExclamationPointIcon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">Claims</span>
                  <span className={cx(navCount, "shrink-0")}>6</span>
                </a>
              </li>

              <li>
                <a href="#carriers" className={navItem}>
                  <HugeiconsIcon
                    icon={Building03Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">Carriers</span>
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className={navGroupLabel}>Facilities</p>
            <ul className="space-y-0.5">
              {facilities.map((facility) => (
                <li key={facility.name}>
                  <a href="#facilities" className={cx(navItem, "pl-8")}>
                    <span className="min-w-0 flex-1 truncate">
                      {facility.name}
                    </span>
                    {facility.needsAttention && (
                      <span
                        className={cx(statusWordSm, statusWarn, "shrink-0")}
                      >
                        Warning
                        <span className="sr-only">, nearing capacity</span>
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div
          aria-hidden="true"
          className={cx(
            fadeTopOnTray,
            "pointer-events-none absolute inset-x-0 top-0 h-8",
            navEdges.start ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cx(
            fadeBottomOnTray,
            "pointer-events-none absolute inset-x-0 bottom-0 h-8",
            navEdges.end ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      <div
        ref={footerRef}
        className={cx(ruleTop, "relative shrink-0 space-y-0.5 p-2")}
      >
        {footerLinks.map(({ label, icon }) => (
          <a key={label} href="#workspace" className={navItem}>
            <HugeiconsIcon
              icon={icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </a>
        ))}

        <button
          ref={accountTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() =>
            accountOpen ? closeAccount(false) : setAccountOpen(true)
          }
          className={cx(
            ghostButtonMuted,
            buttonLg,
            "mt-1 w-full gap-2.5 pr-2 pl-1 text-left",
          )}
        >
          <span aria-hidden="true" className={avatar}>
            <span className={avatarFallback}>DO</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx(typeLabel, text1, "block truncate")}>
              Devon Okafor
            </span>
            <span className={cx(typeCaption, text3, "block truncate")}>
              Dispatch lead
            </span>
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className={cx("shrink-0", accountOpen && "rotate-180")}
          />
        </button>

        {accountOpen && (
          <div
            ref={accountMenuRef}
            role="menu"
            aria-label="Account"
            className={cx(
              menuPopup,
              overlayEnter,
              "absolute bottom-[calc(100%-0.25rem)] left-2 right-2 z-30",
              accountShown ? "opacity-100" : "opacity-0",
            )}
          >
            {accountMenu.map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => closeAccount(true)}
                className={menuItem}
              >
                <HugeiconsIcon
                  icon={icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function AppShell1() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerShown, setDrawerShown] = useState(false);
  const {
    ref: contentRef,
    edges: contentEdges,
    onScroll: onContentScroll,
  } = useScrollFade<HTMLElement>();
  const shouldFocusRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const view = triggerRef.current?.ownerDocument.defaultView ?? window;
      if (view.matchMedia("(max-width: 1023px)").matches) setDrawerOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const doc = drawer?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => setDrawerShown(true));
    const getFocusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));

    if (shouldFocusRef.current) {
      getFocusable()[0]?.focus({ preventScroll: true });
      shouldFocusRef.current = false;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setDrawerShown(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerShown(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[720px] w-full overflow-hidden",
      )}
    >
      <aside
        className={cx(sidebarSurface, "hidden w-64 shrink-0 flex-col lg:flex")}
      >
        <SidebarBody />
      </aside>

      <div className={cx(pageFog, "flex min-w-0 flex-1 flex-col")}>
        <header
          className={cx(
            topBar,
            "flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6",
          )}
        >
          <button
            ref={triggerRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => {
              shouldFocusRef.current = true;
              setDrawerOpen(true);
            }}
            className={cx(ghostButton, iconButtonMd, "lg:hidden")}
          >
            <HugeiconsIcon
              icon={Menu01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className={breadcrumbList}>
              <li className="hidden items-center gap-1.5 sm:flex">
                <a href="#operations" className={breadcrumbLink}>
                  Operations
                </a>
                <span aria-hidden="true" className={breadcrumbSeparator}>
                  /
                </span>
              </li>
              <li className="flex shrink-0 items-center gap-1.5">
                <a href="#shipments" className={breadcrumbLink}>
                  Shipments
                </a>
                <span aria-hidden="true" className={breadcrumbSeparator}>
                  /
                </span>
              </li>
              <li className="min-w-0">
                <span
                  aria-current="page"
                  className={cx(breadcrumbCurrent, "block truncate")}
                >
                  In transit
                </span>
              </li>
            </ol>
          </nav>

          <label className="relative hidden w-56 shrink-0 md:block">
            <span className="sr-only">Search shipments</span>
            <span className={cx(inputBox, fieldMd)}>
              <span data-affix className={inputAffix}>
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </span>
              <input
                type="search"
                placeholder="Search shipments"
                className={inputControl}
              />
            </span>
          </label>

          <button
            type="button"
            aria-label="Book shipment"
            className={cx(primaryButton, buttonMd)}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Book shipment</span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-2">
          <div className={cx(frame, "min-h-0 flex-1")}>
            <main
              ref={contentRef}
              onScroll={onContentScroll}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="p-4">
                <div className={statGroup}>
                  <div className={statGrid}>
                    {metrics.map((metric) => (
                      <div key={metric.label} className={statCell}>
                        <p className={statLabel}>{metric.label}</p>
                        <p className={statValue}>{metric.value}</p>
                        <p className={cx(statDescription, "mt-auto")}>
                          {metric.delta}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex h-9 items-center justify-between gap-3 px-4">
                <h2 className={cx(typeLabel, "min-w-0 truncate")}>
                  Active shipments
                </h2>
                <span className={cx(typeCaption, text3, "shrink-0")}>
                  14 of 1,284
                </span>
              </div>

              <table className={cx(table, "hidden table-fixed md:table")}>
                <caption className="sr-only">
                  Shipments currently in transit
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={cx(tableHead, "h-9 w-[11%]")}>
                      Reference
                    </th>
                    <th scope="col" className={cx(tableHead, "h-9 w-[22%]")}>
                      Consignee
                    </th>
                    <th
                      scope="col"
                      className={cx(
                        tableHead,
                        "hidden h-9 w-[24%] lg:table-cell",
                      )}
                    >
                      Carrier
                    </th>
                    <th scope="col" className={cx(tableHead, "h-9 w-[16%]")}>
                      Status
                    </th>
                    <th
                      scope="col"
                      className={cx(tableHead, numericCell, "h-9 w-[11%]")}
                    >
                      ETA
                    </th>
                    <th
                      scope="col"
                      className={cx(tableHead, numericCell, "h-9 w-[16%]")}
                    >
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr
                      key={shipment.reference}
                      className={cx(tableRow, "h-11")}
                    >
                      <td className={tableCell}>
                        <span className={cx(typeCodeSm, text2)}>
                          {shipment.reference}
                        </span>
                      </td>
                      <td className={tableCell}>
                        <span className={cx(typeLabel, "block truncate")}>
                          {shipment.consignee}
                        </span>
                      </td>
                      <td className={cx(tableCell, "hidden lg:table-cell")}>
                        {shipment.carrier && (
                          <span className={cx(text2, "block truncate")}>
                            {shipment.carrier}
                          </span>
                        )}
                      </td>
                      <td className={tableCell}>
                        <StatusCell status={shipment.status} />
                      </td>
                      <td className={cx(tableCell, numericCell)}>
                        <span className={text2}>{shipment.eta}</span>
                      </td>
                      <td className={cx(tableCell, numericCell)}>
                        {shipment.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="space-y-2 px-4 pb-4 md:hidden">
                {shipments.map((shipment) => (
                  <li key={shipment.reference} className={cx(frame, "p-4")}>
                    <div className="flex items-start justify-between gap-3">
                      <p className={cx(typeLabel, "min-w-0 flex-1 truncate")}>
                        {shipment.consignee}
                      </p>
                      <span className={cx(typeBodySm, "shrink-0 tabular-nums")}>
                        {shipment.value}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <StatusCell status={shipment.status} />
                      <span className={cx(typeCodeSm, text3, "shrink-0")}>
                        {shipment.reference}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span
                        className={cx(typeCaption, text3, "min-w-0 truncate")}
                      >
                        {shipment.carrier}
                      </span>
                      <span className={cx(typeCaption, text3, "shrink-0")}>
                        {shipment.eta}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </main>
            <div
              aria-hidden="true"
              className={cx(
                fadeTopOnPaper,
                "pointer-events-none absolute inset-x-0 top-0 h-8",
                contentEdges.start ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              aria-hidden="true"
              className={cx(
                fadeBottomOnPaper,
                "pointer-events-none absolute inset-x-0 bottom-0 h-8",
                contentEdges.end ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeDrawer}
            tabIndex={-1}
            className={cx(
              backdrop,
              overlayEnter,
              "absolute inset-0 z-30 cursor-pointer",
              drawerShown ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cx(
              sidebarSurface,
              overlayShadow,
              overlayEnter,
              "absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col",
              drawerShown ? "opacity-100" : "opacity-0",
            )}
          >
            <SidebarBody onClose={closeDrawer} />
          </aside>
        </div>
      )}
    </div>
  );
}
