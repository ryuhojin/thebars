import type { ReactNode } from "react";

export function ResponsiveMenuFrame({ children }: { children: ReactNode }) {
  return <div className="responsive-menu-frame">{children}</div>;
}
