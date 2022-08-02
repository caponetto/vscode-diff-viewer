/*
 * These functions read and write information in a patch/diff file on which
 * files have been "viewed" by the user.
 *
 * The usage scenario is like this: a developer is reviewing a long-ish diff and
 * they want to persistently keep track of the files they have seen.
 *
 * The information is saved in a line like this:
 * `viewed f18 (hex bitmap)`
 *
 * The syntax is: "viewed" SP <hexBitmap> SP <comment>
 *
 * There must not be any whitespace before the word "viewed". The comment can be
 * anything (after the hex bitmap, the rest of the line is ignored).
 *
 * The hex bitmap is a hexadecimal representation of the boolean array that
 * indicates which files have been viewed. E.g. "e8" means that the first,
 * second, third and fifth files are marked as viewed. ("e8" is 11101000).
 *
 * The "viewed" line can be anywhere in the diff file; by default it's saved at
 * the top of the file.
 *
 * Author: Jacek Kopecky <jacek@jacek.cz> 2022
 */

import { parseHexBitmap, bitmapToHex } from "./hex-bitmap";

const VIEWED_RE = /(^|\n)viewed\s+([0-9a-f]+)(\s.*)\s*($|\n)/i;
const VIEWED_HEX_POS = 2; // capturing group index

export function  getViewedFiles(diffContent: string): boolean[] {
  const viewedMatch = VIEWED_RE.exec(diffContent);
  const viewed = viewedMatch?.[VIEWED_HEX_POS]?.trim();
  if (viewed) {
    return parseHexBitmap(viewed);
  }
  return [];
}

export function updateViewedFiles(diffContent: string, index: number, viewed: boolean, eol = '\n'): string {
  const viewedMatch = VIEWED_RE.exec(diffContent);
  const origViewedFiles = viewedMatch?.[VIEWED_HEX_POS]?.trim();
  const bitmap = origViewedFiles ? parseHexBitmap(origViewedFiles) : [];
  bitmap[index] = viewed;

  const lineStart = viewedMatch?.[1] ?? '';

  const newViewedLine = `${lineStart}viewed ${bitmapToHex(bitmap)} (hex bitmap)${eol}`;

  if (origViewedFiles) {
    return diffContent.replace(VIEWED_RE, newViewedLine);
  } else {
    return newViewedLine + diffContent;
  }
}

