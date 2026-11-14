/**
 * Nav id → HugeiconsIcon map for the React Bits Pro app shell.
 * The sidebar config (src/navigation/sidebar/sidebar-items.ts) carries Lucide
 * icons for the legacy UI; the rebuilt shell renders Hugeicons to match the
 * React Bits Pro blocks. IDs stay stable — only the glyph changes.
 */

import {
  Activity01Icon,
  Alert02Icon,
  BanIcon,
  BrainIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  CommandIcon,
  DashboardSquare01Icon,
  FileIcon,
  Folder01Icon,
  FolderSyncIcon,
  GlobalIcon,
  Message01Icon,
  Notification01Icon,
  PlugIcon,
  RadioIcon,
  RobotIcon,
  ScrollTextIcon,
  Settings01Icon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  WrenchIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

const NAV_ICONS: Record<string, IconSvgElement> = {
  dashboard: DashboardSquare01Icon,
  chat: Message01Icon,
  tasks: ClipboardListIcon,
  schedules: CalendarClockIcon,
  findings: Alert02Icon,
  traffic: Activity01Icon,
  repeater: CommandIcon,
  commands: TerminalIcon,
  "llm-records": RadioIcon,
  assets: GlobalIcon,
  sync: FolderSyncIcon,
  workspace: Folder01Icon,
  llm: BrainIcon,
  agents: RobotIcon,
  mcp: PlugIcon,
  skills: SparklesIcon,
  tools: WrenchIcon,
  notify: Notification01Icon,
  intercept: ShieldIcon,
  "asset-intercept": BanIcon,
  approvals: ClipboardListIcon,
  logs: ScrollTextIcon,
  settings: Settings01Icon,
};

export function navIcon(id: string): IconSvgElement {
  return NAV_ICONS[id] ?? FileIcon;
}
