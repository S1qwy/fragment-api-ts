import { mnemonicValidate, mnemonicToPrivateKey } from "@ton/crypto";
import {
  ConfigurationError, CookieError, ParseError,
} from "../exceptions";
import {
  PAYMENT_METHODS, STARS_GIVEAWAY_PACKAGES, WALLET_MAX_MESSAGES,
} from "../types/constants";
import type {
  ApiObject, ApiProvider, Cookies, NormalizedPaymentMethod, WalletVersion,
} from "../types/results";

/*
 * Narrow untrusted response values to plain object-like records.
 *
 * Arrays and null are deliberately excluded. This helper does not perform
 * schema validation; individual protocol readers validate required fields.
 */
export function isObject(value: unknown): value is ApiObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function object(value: unknown, context = "response"): ApiObject {
  if (!isObject(value)) throw new ParseError(`${context} must be an object.`);
  return value;
}

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

export function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

/*
 * Validate a JavaScript quantity without coercing strings or booleans.
 *
 * JavaScript has one ordinary numeric type, so 3 and 3.0 are equivalent.
 * Fractional values, unsafe integers, NaN, and infinities are rejected.
 */
export function integer(
  value: unknown,
  low: number,
  high: number,
  message = "Invalid integer quantity."
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < low ||
    value > high
  ) throw new ConfigurationError(message);
  return value;
}

export function positiveTimeout(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 2_147_483_647
  ) throw new ConfigurationError("Timeout must be a positive millisecond value.");
  return value;
}

export function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new ConfigurationError(`${name} must be a boolean.`);
  }
  return value;
}

export function months(value: unknown): number {
  const result = integer(value, 3, 12, "Premium duration must be 3, 6, or 12.");
  if (![3, 6, 12].includes(result)) {
    throw new ConfigurationError("Premium duration must be 3, 6, or 12.");
  }
  return result;
}

export function starsGiveaway(amount: unknown, winners: unknown): void {
  const quantity = integer(amount, 500, 1_000_000);
  if (!STARS_GIVEAWAY_PACKAGES.has(quantity)) {
    throw new ConfigurationError("Unsupported total Stars giveaway package.");
  }
  integer(
    winners, 1, Math.min(Math.floor(quantity / 100), 10_000),
    "Winner count exceeds this Stars package's limit."
  );
}

export function normalizePaymentMethod(value: unknown): NormalizedPaymentMethod {
  const method = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw new ConfigurationError(`Unsupported payment method: ${method}`);
  }
  return (
    method === "gram" ? "ton" : method === "usdt_gram" ? "usdt_ton" : method
  ) as NormalizedPaymentMethod;
}

export function normalizeProvider(value: unknown): ApiProvider {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (provider !== "tonapi" && provider !== "toncenter") {
    throw new ConfigurationError("Provider must be tonapi or toncenter.");
  }
  return provider;
}

export function normalizeWalletVersion(value: unknown): WalletVersion {
  if (typeof value === "string") {
    const found = Object.keys(WALLET_MAX_MESSAGES).find(
      key => key.toLowerCase() === value.trim().toLowerCase()
    );
    if (found) return found as WalletVersion;
  }
  throw new ConfigurationError("Unsupported wallet version.");
}

export function normalizeSeed(value: unknown): string {
  if (typeof value !== "string") {
    throw new ConfigurationError("A TON mnemonic string is required.");
  }
  const words = value.trim().toLowerCase().split(/\s+/);
  if (![12, 18, 24].includes(words.length)) {
    throw new ConfigurationError("TON mnemonic must contain 12, 18, or 24 words.");
  }
  return words.join(" ");
}

export async function validateSeed(value: unknown): Promise<string> {
  const seed = normalizeSeed(value);
  const words = seed.split(" ");
  
  const isValidTon = await mnemonicValidate(words);
  if (!isValidTon) {
    try {
      await mnemonicToPrivateKey(words);
    } catch {
      throw new ConfigurationError("Invalid basic TON mnemonic.");
    }
  }
  return seed;
}

/*
 * Convert decimal currency text into exact integer base units.
 *
 * Decimal strings are preferred. Numeric inputs are accepted only when they
 * are already safe integers, preventing an imprecise floating-point quote
 * from silently entering payment arithmetic. Scientific notation is rejected.
 */
export function decimalUnits(value: unknown, decimals: number): bigint {
  integer(decimals, 0, 36, "Invalid decimal precision.");
  if (typeof value === "bigint") {
    if (value < 0n) throw new ConfigurationError("Negative payment amount.");
    return value * 10n ** BigInt(decimals);
  }
  if (typeof value === "number") {
    integer(value, 0, Number.MAX_SAFE_INTEGER, "Use a decimal string for currency.");
    value = String(value);
  }
  if (typeof value !== "string") {
    throw new ConfigurationError("A decimal payment amount is required.");
  }
  const raw = value.trim().replace(/,/g, "");
  const match = /^\+?(\d+)(?:\.(\d*))?$/.exec(raw);
  if (!match) throw new ConfigurationError("Invalid decimal payment amount.");
  const fraction = match[2] ?? "";
  if (/[1-9]/.test(fraction.slice(decimals))) {
    throw new ConfigurationError("Payment amount exceeds supported precision.");
  }
  return BigInt(match[1]) * 10n ** BigInt(decimals) +
    BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0");
}

export function formatUnits(value: bigint, decimals: number): string {
  integer(decimals, 0, 36);
  const digits = value.toString().padStart(decimals + 1, "0");
  if (!decimals) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}

/*
 * Parse supported cookie formats while rejecting malformed credential data.
 *
 * Cookie values remain strings. Control characters, separators, and invalid
 * names are rejected before they can reach HTTP headers or persistent storage.
 * Error messages intentionally do not repeat supplied credential values.
 */
export function parseCookies(value: unknown): Cookies {
  try {
    if (typeof value === "string") {
      const raw = value.trim();
      if (raw.startsWith("{")) value = JSON.parse(raw);
      else {
        const entries: Array<[string, string]> = [];
        for (const part of raw.split(";")) {
          if (!part.trim()) continue;
          const index = part.indexOf("=");
          if (index < 1) throw new Error();
          entries.push([
            part.slice(0, index).trim(),
            part.slice(index + 1).trim(),
          ]);
        }
        value = Object.fromEntries(entries);
      }
    }
    if (!isObject(value)) throw new Error();
    const entries = Object.entries(value);
    for (const [key, item] of entries) {
      if (
        !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key) ||
        typeof item !== "string" ||
        /[\x00-\x20\x7f;]/.test(item)
      ) throw new Error();
    }
    return Object.fromEntries(entries) as Cookies;
  } catch {
    throw new CookieError("Cookies must be a valid string-to-string document.");
  }
}

export function validateCookieKeys(
  cookies: Cookies,
  required: readonly string[]
): void {
  const missing = required.filter(key => !cookies[key]?.trim());
  if (missing.length) {
    throw new CookieError(`Missing required cookie keys: ${missing.join(", ")}`);
  }
}

export function recipient(value: unknown): string {
  if (typeof value !== "string") {
    throw new ConfigurationError("Recipient must be a public Telegram username.");
  }
  const result = value.trim()
    .replace(/^(?:https?:\/\/)?t\.me\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "");
  if (!result || /[/?#&\s]/.test(result)) {
    throw new ConfigurationError("Recipient must be a public Telegram username.");
  }
  return result;
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConfigurationError(`${name} is required.`);
  }
  return value.trim();
}

/*
 * Extract one JSON object from a JavaScript initialization call.
 *
 * The scanner tracks string escapes and nested braces instead of assuming
 * that the first closing brace terminates the object. It never evaluates
 * JavaScript and accepts JSON syntax only.
 */
export function embeddedObject(source: string, marker: string): ApiObject {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new ParseError(`Missing embedded object: ${marker}`);
  let start = markerIndex + marker.length;
  while (/\s/.test(source[start] ?? "") && start < source.length) start++;
  if (source[start] !== "{") throw new ParseError("Expected embedded JSON object.");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) {
      try {
        return object(JSON.parse(source.slice(start, index + 1)));
      } catch {
        throw new ParseError("Invalid embedded JSON object.");
      }
    }
  }
  throw new ParseError("Unterminated embedded JSON object.");
}