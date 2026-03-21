export function getPathBaseName(path: string): string {
  const normalizedPath = path.replaceAll("\\", "/").replaceAll(/\/+$/g, "");
  const pathSegments = normalizedPath.split("/");

  return pathSegments.at(-1) || normalizedPath;
}
