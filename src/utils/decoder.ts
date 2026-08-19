import { Cell } from "@ton/core";
import { ParseError, fmt } from "../exceptions";

/**
 * Decode a base64-encoded BOC payload to a plain-text comment or raw Cell.
 * Fragment returns transaction comments as TON Cells in base64.
 * Text comments (op=0) are decoded to readable strings.
 * Structured messages (op!=0) are returned as Cell objects.
 */
export function decodeBocComment(payload: string): string | Cell {
  let s = payload.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!s) return "";
  while (s.length % 4 !== 0) s += "=";

  try {
    const boc = Buffer.from(s, "base64");
    const cell = Cell.fromBoc(boc)[0];
    const sl = cell.beginParse();
    const op = sl.loadUint(32);
    if (op !== 0) {
      return cell;
    }
    try {
      const remaining = sl.loadBuffer(sl.remainingBits / 8);
      return remaining.toString("utf-8").trim();
    } catch {
      return cell;
    }
  } catch (exc) {
    throw new ParseError(
      fmt(ParseError.UNPARSEABLE, { context: "payload decode", exc: String(exc) })
    );
  }
}