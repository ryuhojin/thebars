import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSnapshot() {
  const slug = window.location.pathname.replace(/^\/+/, "").split("/")[0];
  return slug || null;
}

export function useEncodedSlug() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
