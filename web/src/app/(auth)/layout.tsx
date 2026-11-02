import type { ReactNode } from "react";
import { LanguageSelector } from "@/i18n/provider";

export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <LanguageSelector />
      </div>
      {children}
    </>
  );
}
