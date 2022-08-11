export function extractNumberFromString(str: string): number | undefined {
  const num = Number.parseInt(str.trim());
  return Number.isNaN(num) ? undefined : num;
}

export function extractNewFileNameFromDiffName(diffName: string): string {
  const renamedFileNameRegex = /\{\S+ → (\S+)\}/gu;
  return diffName.replace(renamedFileNameRegex, "$1");
}
