import type { ReactNode } from "react";
import type { FoundationRoute } from "../../../contracts/foundation";

type RouteGuardProps = {
  route: FoundationRoute;
  children: ReactNode;
};

export function RouteGuard({ route, children }: RouteGuardProps) {
  return (
    <section data-auth-mode={route.auth} data-route-status={route.status}>
      {children}
    </section>
  );
}
