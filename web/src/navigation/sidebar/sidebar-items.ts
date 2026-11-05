import {
  Activity,
  Ban,
  BellRing,
  Bot,
  Brain,
  Bug,
  CalendarClock,
  ClipboardList,
  FolderOpen,
  FolderSync,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Network,
  Plug,
  Radio,
  Repeat,
  ScrollText,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  Terminal,
  Wrench,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export function getSidebarItems(t: (key: string) => string): NavGroup[] {
  return [
    {
      id: 1,
      label: t("features"),
      items: [
        { id: "dashboard", title: t("dashboard"), url: "/dashboard", icon: LayoutDashboard },
        { id: "chat", title: t("chat"), url: "/chat", icon: MessageSquare },
        { id: "tasks", title: t("tasks"), url: "/function/tasks", icon: Target },
        { id: "schedules", title: t("schedules"), url: "/function/schedules", icon: CalendarClock },
        { id: "findings", title: t("findings"), url: "/function/findings", icon: Bug },
        { id: "traffic", title: t("traffic"), url: "/function/traffic", icon: Activity },
        { id: "repeater", title: t("repeater"), url: "/function/repeater", icon: Repeat },
        { id: "commands", title: t("commands"), url: "/function/commands", icon: Terminal },
        { id: "llm-records", title: t("llm-records"), url: "/function/llm-records", icon: Radio },
        { id: "assets", title: t("assets"), url: "/function/assets", icon: Network },
        { id: "sync", title: t("sync"), url: "/function/sync", icon: FolderSync },
        { id: "workspace", title: t("workspace"), url: "/function/workspace", icon: FolderOpen },
      ],
    },
    {
      id: 2,
      label: t("system"),
      items: [
        { id: "llm", title: t("llm"), url: "/system/llm", icon: Brain },
        { id: "agents", title: t("agents"), url: "/system/agents", icon: Bot },
        { id: "mcp", title: t("mcp"), url: "/system/mcp", icon: Plug },
        { id: "skills", title: t("skills"), url: "/system/skills", icon: Sparkles },
        { id: "tools", title: t("tools"), url: "/system/tools", icon: Wrench },
        { id: "notify", title: t("notify"), url: "/system/notify", icon: BellRing },
        { id: "intercept", title: t("intercept"), url: "/system/intercept", icon: ShieldAlert },
        { id: "asset-intercept", title: t("asset-intercept"), url: "/system/intercept/assets", icon: Ban },
        { id: "approvals", title: t("approvals"), url: "/system/intercept/approvals", icon: ClipboardList },
        { id: "logs", title: t("logs"), url: "/system/logs", icon: ScrollText },
        { id: "settings", title: t("settings"), url: "/system/settings", icon: Settings2 },
      ],
    },
  ];
}
