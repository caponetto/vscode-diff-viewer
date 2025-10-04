import { getSha1Hash } from "../hash";
import { webcrypto } from "crypto";

declare global {
  interface Window {
    crypto: Crypto;
  }
}

// Set up the crypto mock for testing
(global as unknown as { window: Window }).window = {
  crypto: webcrypto as Crypto,
} as Window;

describe("hash :: getSha1Hash", () => {
  it.each([
    ["test", "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"],
    ["test\n", "4e1243bd22c66e76c2ba9eddc1f91394e57f9f83"],
    ["", "da39a3ee5e6b4b0d3255bfef95601890afd80709"], // empty string
    ["hello world", "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed"], // longer string
  ])("should match known SHA-1 hash", async (value: string, expected: string) => {
    const result = await getSha1Hash(value);
    expect(result).toBe(expected);
  });

  it("should handle special characters and unicode", async () => {
    const result = await getSha1Hash("café 🚀");
    expect(result).toBe("e5f4d9efd1cc48cb9bc5f4834c88ddf1d245376d");
  });

  it("should return consistent results for same input", async () => {
    const input = "consistent test input";
    const result1 = await getSha1Hash(input);
    const result2 = await getSha1Hash(input);
    expect(result1).toBe(result2);
  });
});
