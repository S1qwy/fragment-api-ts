import { Cell } from "@ton/core";
import { ParseError } from "../exceptions";

/*
 * Decode exactly one BOC root while preserving its binary cell structure.
 *
 * Base64url and ordinary base64 are accepted. Invalid alphabet characters,
 * malformed padding, and multiple roots are rejected rather than silently
 * selecting or reconstructing a different payment payload.
 */
export function decodeBoc(payload: string): Cell {
  try {
    const normalized = payload.trim().replace(/-/g, "+").replace(/_/g, "/");
    if (
      !normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) ||
      normalized.replace(/=+$/, "").length % 4 === 1
    ) throw new Error();
    const binary = Buffer.from(normalized, "base64");
    if (
      binary.toString("base64").replace(/=+$/, "") !==
      normalized.replace(/=+$/, "")
    ) throw new Error();
    const roots = Cell.fromBoc(binary);
    if (roots.length !== 1) throw new Error();
    return roots[0];
  } catch {
    throw new ParseError("Invalid single-root BOC.");
  }
}

export function decodeBocComment(payload: string): string | Cell {
  if (!payload.trim()) return "";
  const cell = decodeBoc(payload);
  try {
    const slice = cell.beginParse();
    return slice.loadUint(32) === 0 ? slice.loadStringTail() : cell;
  } catch {
    return cell;
  }
}