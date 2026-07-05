export function buildPublicUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  if (!path) return base;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encodedPath}`;
}

