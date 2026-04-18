export function getPathBaseName(path: string): string {
  const slashNormalizedPath = path.replaceAll("\\", "/");
  const normalizedPath = slashNormalizedPath.replaceAll(/\/+$/g, "") || slashNormalizedPath;
  const pathSegments = normalizedPath.split("/");

  return pathSegments.at(-1) || normalizedPath;
}
