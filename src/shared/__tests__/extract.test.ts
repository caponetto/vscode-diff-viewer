import { extractNewFileNameFromDiffName, extractNumberFromString } from "../extract";

describe("convert :: extractNumberFromString", () => {
  it.each([
    ["0", 0],
    ["10", 10],
    ["", undefined],
    ["not-a-number", undefined],
  ])("should convert string to number", (value: string, expected: number | undefined) => {
    expect(extractNumberFromString(value)).toBe(expected);
  });
});

describe("convert :: extractNewFileNameFromDiffName", () => {
  it.each([
    ["file.ts", "file.ts"],
    ["dir/file.ts", "dir/file.ts"],
    ["{oldName.ts → newName.ts}", "newName.ts"],
    ["{oldDir → newDir}/file.ts", "newDir/file.ts"],
    ["dir/{oldName.ts → newName.ts}", "dir/newName.ts"],
  ])("should extract file name from diff name", (value: string, expected: string) => {
    expect(extractNewFileNameFromDiffName(value)).toBe(expected);
  });
});
