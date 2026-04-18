import { getPathBaseName } from "../path";

describe("getPathBaseName", () => {
  it("returns the last segment for POSIX and Windows-style paths", () => {
    expect(getPathBaseName("/workspace/src/file.ts")).toBe("file.ts");
    expect(getPathBaseName(String.raw`C:\workspace\src\file.ts`)).toBe("file.ts");
  });

  it("trims trailing slashes before returning the last non-root segment", () => {
    expect(getPathBaseName("/workspace/src/")).toBe("src");
  });

  it("preserves root-like paths when trimming leaves no basename", () => {
    expect(getPathBaseName("/")).toBe("/");
    expect(getPathBaseName("///")).toBe("///");
  });
});
