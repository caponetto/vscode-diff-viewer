import { getSha1Hash } from "../hash";
import { webcrypto } from "crypto";

// mock window.crypto
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.window = { crypto: webcrypto } as any;

describe("hash :: getSha1Hash", () => {
  it.each([
    ["test", "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"],
    ["test\n", "4e1243bd22c66e76c2ba9eddc1f91394e57f9f83"],
  ])("should match known SHA-1 hash", (value: string, expected: string) => {
    expect(getSha1Hash(value)).resolves.toBe(expected);
  });
});
