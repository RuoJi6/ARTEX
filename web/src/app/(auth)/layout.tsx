import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";

export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <LanguageSwitcher />
      </div>
      {children}
    </>
  );
}
