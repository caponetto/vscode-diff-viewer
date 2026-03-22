import { DiffFile } from "diff2html/lib/types";
import { buildDiffFileMap, buildDiffFileViewModel, buildDiffHashes, normalizeDiffFilePath } from "../models";
import { getSha1Hash } from "../../hash";

jest.mock("../../hash", () => ({
  getSha1Hash: jest.fn(),
}));

const mockGetSha1Hash = getSha1Hash as jest.MockedFunction<typeof getSha1Hash>;

const createDiffFile = (args: Partial<DiffFile> & Pick<DiffFile, "newName" | "oldName">): DiffFile =>
  ({
    blocks: [],
    addedLines: 0,
    deletedLines: 0,
    isCombined: false,
    isGitDiff: true,
    language: "typescript",
    ...args,
  }) as DiffFile;

describe("message/handler/models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSha1Hash.mockImplementation(async (value) => `sha:${value}`);
  });

  it("normalizes diff file paths and ignores /dev/null", () => {
    expect(normalizeDiffFilePath("/dev/null")).toBeUndefined();
    expect(normalizeDiffFilePath("src/file.ts")).toBe("src/file.ts");
    expect(normalizeDiffFilePath("src/{old name.ts → new name.ts}")).toBe("src/new name.ts");
  });

  it("builds a diff file view model with accessible flags", () => {
    const viewModel = buildDiffFileViewModel(
      createDiffFile({ oldName: "src/old.ts", newName: "src/new.ts" }),
      new Set(["src/new.ts"]),
    );

    expect(viewModel.primaryPath).toBe("src/new.ts");
    expect(viewModel.isOldPathAccessible).toBe(false);
    expect(viewModel.isNewPathAccessible).toBe(true);
  });

  it("builds a diff file map and hashes", async () => {
    const diffFiles = [
      createDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" }),
      createDiffFile({ oldName: "/dev/null", newName: "src/added.ts" }),
    ];
    const accessiblePaths = new Set(["src/file.ts", "src/added.ts"]);
    const currentDiffFilesByPath = buildDiffFileMap(diffFiles, accessiblePaths);

    const hashes = await buildDiffHashes({
      payload: {
        config: {} as never,
        diffFiles,
        accessiblePaths: ["src/file.ts", "src/added.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      },
      currentDiffFilesByPath,
      accessiblePaths,
    });

    expect(Object.keys(currentDiffFilesByPath)).toEqual(["src/file.ts", "src/added.ts"]);
    expect(hashes["src/file.ts"]).toContain("sha:");
    expect(hashes["src/added.ts"]).toContain("sha:");
  });
});
