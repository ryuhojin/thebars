import { useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSnapshot() {
  return window.location.pathname;
}

export function useBrowserPath() {
  const pathname = useSyncExternalStore(subscribe, getSnapshot, () => "/dashboard");

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[data-app-link]");
      if (!anchor) return;
      if (anchor.origin !== window.location.origin) return;
      event.preventDefault();
      window.history.pushState(null, "", anchor.pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    document.addEventListener("click", clickHandler);
    return () => document.removeEventListener("click", clickHandler);
  }, []);

  return pathname;
}
