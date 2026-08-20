import {
  BASE_HEADERS,
  DEFAULT_TIMEOUT,
  FRAGMENT_BASE_URL,
} from "../types/constants";
import { FragmentPageError, ParseError, fmt } from "../exceptions";
import { withRetry } from "./retry";

export function buildHeaders(pageUrl: string = FRAGMENT_BASE_URL): Record<string, string> {
  return {
    ...BASE_HEADERS,
    referer: pageUrl,
    "x-aj-referer": pageUrl,
  };
}

function makeAjaxHeaders(headers: Record<string, string>): Record<string, string> {
  const h = { ...headers };
  h["accept"] = "application/json, text/javascript, */*; q=0.01";
  h["x-requested-with"] = "XMLHttpRequest";
  delete h["content-type"];
  return h;
}

function makeFullPageHeaders(): Record<string, string> {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": BASE_HEADERS["user-agent"],
  };
}

function extractHashFromText(text: string, url: string): string {
  const match = text.match(/(?:https:\/\/fragment\.com)?\/api\?hash=([a-f0-9]+)/);
  if (!match) {
    throw new FragmentPageError(fmt(FragmentPageError.HASH_NOT_FOUND, { url }));
  }
  return match[1];
}

function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function parseJsonResponse(text: string, context: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch (exc) {
    throw new ParseError(fmt(ParseError.UNPARSEABLE, { context, exc: String(exc) }));
  }
}

const _hashCache: Map<string, { hash: string; time: number }> = new Map();
const _HASH_TTL = 120_000;

/**
 * Fetch a Fragment page via AJAX navigation with automatic retry.
 */
export async function fetchPageAjax(
  cookies: Record<string, string>,
  headers: Record<string, string>,
  pageUrl: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Record<string, any>> {
  return withRetry(async () => {
    const ajaxHeaders = makeAjaxHeaders(headers);
    ajaxHeaders["cookie"] = cookieString(cookies);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        headers: ajaxHeaders,
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status === 302) {
        throw new FragmentPageError(fmt(FragmentPageError.ITEM_NOT_FOUND, { url: pageUrl }));
      }
      if (response.status !== 200) {
        throw new FragmentPageError(
          fmt(FragmentPageError.BAD_STATUS, { status: response.status, url: pageUrl })
        );
      }

      const text = await response.text();
      return parseJsonResponse(text, `page ${pageUrl}`);
    } finally {
      clearTimeout(timer);
    }
  }, { context: "fetchPageAjax" });
}

/**
 * Fetch the API hash from Fragment homepage with caching and retry.
 */
export async function fetchFragmentHash(
  cookies: Record<string, string>,
  _headers: Record<string, string>,
  _pageUrl: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const cacheKey = JSON.stringify(Object.entries(cookies).sort());
  const now = Date.now();

  const cached = _hashCache.get(cacheKey);
  if (cached && (now - cached.time) < _HASH_TTL) {
    return cached.hash;
  }

  return withRetry(async () => {
    const fullHeaders = makeFullPageHeaders();
    fullHeaders["cookie"] = cookieString(cookies);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch("https://fragment.com", {
        method: "GET",
        headers: fullHeaders,
        signal: controller.signal,
      });

      if (response.status !== 200) {
        throw new FragmentPageError(
          fmt(FragmentPageError.BAD_STATUS, { status: response.status, url: "https://fragment.com" })
        );
      }

      const text = await response.text();
      const apiHash = extractHashFromText(text, "https://fragment.com");
      _hashCache.set(cacheKey, { hash: apiHash, time: Date.now() });
      return apiHash;
    } finally {
      clearTimeout(timer);
    }
  }, { context: "fetchFragmentHash" });
}

/**
 * POST a request to the Fragment API with automatic retry.
 */
export async function postFragmentApi(
  cookies: Record<string, string>,
  fragmentHash: string,
  headers: Record<string, string>,
  data: Record<string, any>,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Record<string, any>> {
  return withRetry(async () => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        body.append(key, String(value));
      }
    }

    const postHeaders = {
      ...headers,
      cookie: cookieString(cookies),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${FRAGMENT_BASE_URL}/api?hash=${fragmentHash}`, {
        method: "POST",
        headers: postHeaders,
        body: body.toString(),
        signal: controller.signal,
      });

      const text = await response.text();
      return parseJsonResponse(text, data.method || "unknown");
    } finally {
      clearTimeout(timer);
    }
  }, { context: "postFragmentApi" });
}