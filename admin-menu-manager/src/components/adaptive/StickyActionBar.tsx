import type { ReactNode } from "react";

export function StickyActionBar({ children }: { children: ReactNode }) {
  return <div className="sticky-action-bar">{children}</div>;
}
