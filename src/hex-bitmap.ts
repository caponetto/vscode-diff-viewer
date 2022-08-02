/*
 * These functions deal with a hexadecimal representation of arrays of booleans.
 *
 * An array like [true, true, true, false, true] can be represented as "e8":
 * it is 11101, which is nibble-padded to 11101000, which is then "E" and "8".
 * The above is what `bitmapToHex` does.
 *
 * Unpacking with `parseHexBitmap` always produces a 4-padded array of booleans.
 *
 * Author: Jacek Kopecky <jacek@jacek.cz> 2022
 */

const HEX: { [s: string]: [boolean, boolean, boolean, boolean] } = {
  "0": [false, false, false, false],
  "1": [false, false, false, true],
  "2": [false, false, true, false],
  "3": [false, false, true, true],
  "4": [false, true, false, false],
  "5": [false, true, false, true],
  "6": [false, true, true, false],
  "7": [false, true, true, true],
  "8": [true, false, false, false],
  "9": [true, false, false, true],
  a: [true, false, true, false],
  b: [true, false, true, true],
  c: [true, true, false, false],
  d: [true, true, false, true],
  e: [true, true, true, false],
  f: [true, true, true, true],
};

const TO_HEX = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];

/*
 * Parses a hexadecimal number into a boolean bitmap, first-bit-first.
 * For example, "e8" becomes `[true, true, true, false, true, false, false, false]`.
 */
export function parseHexBitmap(s: string): boolean[] {
  const retval = [];
  for (const char of s) {
    retval.push(...HEX[char.toLowerCase()]);
  }
  return retval;
}

/*
 * Encode a boolean array into a hexadecimal number, first-bit-first.
 * For example `[true, true, true, false, true, false, false, false]` becomes "e8".
 *
 * The resulting string represents an array that may be up to three falses
 * longer than the original. Therefore, don't use this function if you need to
 * preserve the exact length of the original array.
 */
export function bitmapToHex(bitmap: boolean[]): string {
  const retval = [];

  // go 4 bits (a nibble) at a time
  for (let i = 0; i < bitmap.length; i += 4) {
    const number = (bitmap[i] ? 8 : 0) + (bitmap[i + 1] ? 4 : 0) + (bitmap[i + 2] ? 2 : 0) + (bitmap[i + 3] ? 1 : 0);
    retval.push(TO_HEX[number]);
  }

  return retval.join("");
}
