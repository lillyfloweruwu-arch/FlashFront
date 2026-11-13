export function parseRoute(hash: string): { path: string; search: string } {
  const [path = "/", search = ""] = hash.replace(/^#/, "").split("?");
  return { path: path || "/", search };
}
