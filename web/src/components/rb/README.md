# React Bits Pro app shell

Application components built on the vendored React Bits Pro blocks in
`src/components/react-bits/`. They reuse the library's design tokens
(`./tokens`, mapped onto the app theme in `src/app/globals.css`) and wire the
blocks' interaction patterns to real app data.

| File | React Bits Pro basis | Wires to |
| --- | --- | --- |
| `app-shell.tsx` | app-shell composition | `(main)/layout.tsx`: auth gate, sidebar + navbar + content, search palette, change-password dialog, egress IP status, version/update badges |
| `app-sidebar.tsx` | `app-sidebar-1` | `getSidebarItems(t)` nav groups, active route, collapse (cookie), mobile drawer, account menu |
| `app-navbar.tsx` | `navbar-6` | search trigger, notifications (egress warnings), theme cycle, language, preferences, account menu |
| `search-palette.tsx` | `command-menu-1` | nav + quick actions, ⌘K/Ctrl+K, arrow-key roving focus |
| `menu-surface.tsx` | block menu pattern | shared dropdown surface (outside-click, Escape, roving focus) |
| `preferences-menu.tsx` | block menu pattern | theme mode, color preset, content layout, font, language |
| `language-menu.tsx` | block menu pattern | locale switch with persistence |
| `auth-card.tsx` | `authentication-1` | login / first-run setup against `api.login` / `api.initPassword`, terms gate |
| `terms-dialog.tsx` | block dialog pattern | terms of use with scroll-to-end accept gate |
| `mobile-nav-button.tsx` | `navbar-6` trigger | opens the shell drawer from pages with their own header |
| `dashboard-kit.tsx` | `dashboard-1`, `analytics-1`, `monitoring-1`, `agent-activity-1`, `list-1` | panels, metric strip, sparkline/trend/column charts, gauges, activity stream, bars |
| `nav-icons.ts` | — | nav id → HugeiconsIcon map |
| `tokens.ts` | all blocks | shared style constants |

Chat uses `ai-chat-1` / `prompt-input-1` patterns directly in
`src/app/(main)/chat/page.tsx` (composer, conversation list) and
`src/components/transcript.tsx` (user bubble, prose answers, tool rows).
