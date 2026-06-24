export function isDeviceSpecificPath(pathname: string): boolean {
  return /^\/(?:app|t|m|mobile|tablet|desktop)(?:\/|$)/.test(pathname);
}
