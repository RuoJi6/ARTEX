import type { ReactNode } from "react";

// Auth pages render their own React Bits Pro chrome (brand panel + card) and
// carry their own language control, so this layout only forwards children.
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
