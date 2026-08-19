import { FragmentClient } from "../client";
import {
  AnonymousNumberError,
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  fmt,
} from "../exceptions";
import { NUMBERS_PAGE } from "../types/constants";
import { LoginCodeResult, TerminateSessionsResult } from "../types/results";
import { parseLoginCode } from "../utils/html";

function stripPlus(number: string): string {
  return typeof number === "string" ? number.replace(/^\+/, "") : number;
}

function htmlUnescape(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * Fetch the current pending login code for an anonymous number.
 */
export async function getLoginCode(
  client: FragmentClient,
  number: string
): Promise<LoginCodeResult> {
  try {
    const clean = stripPlus(number);
    const result = await client.call(
      "updateLoginCodes",
      { number: clean, lt: "0", from_app: "1" },
      NUMBERS_PAGE
    );

    let code: string | null = null;
    let activeSessions = 0;

    if (result.html) {
      [code, activeSessions] = parseLoginCode(result.html);
    }

    return { number, code, activeSessions };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Enable or disable login code delivery for an anonymous number.
 */
export async function toggleLoginCodes(
  client: FragmentClient,
  number: string,
  canReceive: boolean
): Promise<void> {
  try {
    const clean = stripPlus(number);
    const result = await client.call(
      "toggleLoginCodes",
      { number: clean, can_receive: canReceive ? 1 : 0 },
      NUMBERS_PAGE
    );

    if (result.error) {
      throw new FragmentAPIError(htmlUnescape(result.error));
    }
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Terminate all active Telegram sessions for an anonymous number.
 */
export async function terminateSessions(
  client: FragmentClient,
  number: string
): Promise<TerminateSessionsResult> {
  try {
    const clean = stripPlus(number);

    const confirmation = await client.call(
      "terminatePhoneSessions",
      { number: clean },
      NUMBERS_PAGE
    );

    if (confirmation.error) {
      throw new AnonymousNumberError(
        fmt(AnonymousNumberError.TERMINATE_FAILED, {
          number,
          error: htmlUnescape(confirmation.error),
        })
      );
    }

    const terminateHash = confirmation.terminate_hash;
    if (!terminateHash) {
      throw new AnonymousNumberError(fmt(AnonymousNumberError.NOT_OWNED, { number }));
    }

    const result = await client.call(
      "terminatePhoneSessions",
      { number: clean, terminate_hash: terminateHash },
      NUMBERS_PAGE
    );

    if (result.error) {
      throw new AnonymousNumberError(
        fmt(AnonymousNumberError.TERMINATE_FAILED, {
          number,
          error: htmlUnescape(result.error),
        })
      );
    }

    return { number, message: result.msg || null };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}