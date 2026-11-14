import type { ReactNode } from "react";

import { AppShell } from "@/components/rb/app-shell";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
