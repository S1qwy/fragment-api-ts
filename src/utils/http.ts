import * as https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { CookieJar } from "tough-cookie";
import {
  AlreadySubscribedError, ConfigurationError, FragmentAPIError,
  FragmentPageError, PaidMessageLimitError, ParseError, VerificationError,
} from "../exceptions";
import {
  BASE_HEADERS, DEFAULT_TIMEOUT, FRAGMENT_API_URL, FRAGMENT_BASE_URL, HASH_TTL,
} from "../types/constants";
import type { ApiObject, Cookies } from "../types/results";
import { Mutex } from "./async";
import {
  embeddedObject, isObject, object, parseCookies, positiveTimeout, text,
} from "./validation";

export interface HttpResponse {
  status: number;
  text: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeout?: number;
}

/*
 * Validate a proxy without exposing its username or password in failures.
 *
 * Supported schemes match the agents used by HttpSession. A default HTTP
 * or HTTPS port is accepted because URL normalizes explicit default ports.
 */
export function parseProxy(value: string): string {
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:", "socks4:", "socks5:", "socks5h:"].includes(url.protocol) ||
      !url.hostname || url.search || url.hash ||
      (url.pathname && url.pathname !== "/")
    ) throw new Error();
    if (url.protocol.startsWith("socks") && !url.port) throw new Error();
    return url.href;
  } catch {
    throw new ConfigurationError("Invalid proxy URL.");
  }
}

export class HttpSession {
  readonly jar = new CookieJar();
  private readonly agent: https.Agent;
  private readonly active = new Set<import("node:http").ClientRequest>();
  private closed = false;
  private closing: Promise<void> | null = null;

  /*
   * Own a connection agent and a cookie jar for a fixed set of HTTPS origins.
   *
   * Origin restrictions are evaluated before reading cookies or constructing
   * a request. Redirects are returned to the caller rather than followed.
   * Closing this session never closes an externally supplied storage backend.
   */
  constructor(
    readonly origins: readonly string[],
    readonly timeout = DEFAULT_TIMEOUT,
    proxy?: string | null
  ) {
    positiveTimeout(timeout);
    const normalized = proxy ? parseProxy(proxy) : null;
    this.agent = normalized
      ? normalized.startsWith("socks")
        ? new SocksProxyAgent(normalized)
        : new HttpsProxyAgent(normalized)
      : new https.Agent({ keepAlive: true });
  }

  async importCookies(cookies: Cookies, origin = FRAGMENT_BASE_URL): Promise<void> {
    this.validateUrl(origin);
    for (const [key, value] of Object.entries(parseCookies(cookies))) {
      await this.jar.setCookie(`${key}=${value}; Path=/; Secure`, origin);
    }
  }

  async exportCookies(origin = FRAGMENT_BASE_URL): Promise<Cookies> {
    this.validateUrl(origin);
    return Object.fromEntries(
      (await this.jar.getCookies(origin)).map(cookie => [cookie.key, cookie.value])
    );
  }

  private validateUrl(value: string): URL {
    let url: URL;
    try { url = new URL(value); }
    catch { throw new ConfigurationError("Invalid request URL."); }
    if (
      url.protocol !== "https:" || url.username || url.password ||
      !this.origins.includes(url.origin)
    ) throw new ConfigurationError("Request origin is not allowed.");
    return url;
  }

  /*
   * Execute one request with a total request deadline and a bounded body.
   *
   * The deadline includes connection establishment and response consumption.
   * Cookies are updated from Set-Cookie headers on the same allowed origin.
   * No retry occurs here, including after partial request transmission.
   */
  async request(urlValue: string, options: RequestOptions = {}): Promise<HttpResponse> {
    if (this.closed) throw new ConfigurationError("HTTP session is closed.");
    const url = this.validateUrl(urlValue);
    options.signal?.throwIfAborted();
    const cookie = await this.jar.getCookieString(url.href);
    if (this.closed) throw new ConfigurationError("HTTP session is closed.");
    const headers = { ...options.headers };
    if (Object.keys(headers).some(key => key.toLowerCase() === "cookie")) {
      throw new ConfigurationError("Use the session cookie jar, not Cookie headers.");
    }
    if (cookie) headers.cookie = cookie;
    if (options.body !== undefined) {
      headers["content-length"] = String(Buffer.byteLength(options.body));
    }
    const timeout = positiveTimeout(options.timeout ?? this.timeout);

    const response = await new Promise<HttpResponse>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const request = https.request(url, {
        method: options.method ?? "GET",
        headers,
        agent: this.agent,
      });
      this.active.add(request);

      const finish = (error?: unknown, value?: HttpResponse): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        this.active.delete(request);
        if (error) reject(error);
        else resolve(value!);
      };
      const abort = (): void => {
        request.destroy(new Error("Request aborted."));
      };
      timer = setTimeout(() => {
        request.destroy(new Error("Request timed out."));
      }, timeout);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();

      request.on("error", error => finish(error));
      request.on("response", incoming => {
        const chunks: Buffer[] = [];
        let length = 0;
        incoming.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > 16 * 1024 * 1024) {
            incoming.destroy(new Error("Response exceeds the configured size limit."));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("error", error => finish(error));
        incoming.on("aborted", () => finish(new Error("Response interrupted.")));
        incoming.on("end", () => finish(undefined, {
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      request.end(options.body);
    });

    const setCookies = response.headers["set-cookie"];
    for (const cookieValue of Array.isArray(setCookies) ? setCookies : []) {
      await this.jar.setCookie(cookieValue, url.href);
    }
    return response;
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = Promise.resolve().then(() => {
      for (const request of this.active) {
        request.destroy(new Error("HTTP session closed."));
      }
      this.agent.destroy();
    });
    return this.closing;
  }
}

export function validatePageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.origin !== FRAGMENT_BASE_URL || url.username || url.password ||
      url.protocol !== "https:"
    ) throw new Error();
    return url.href;
  } catch {
    throw new ConfigurationError("Authenticated URLs must use HTTPS fragment.com.");
  }
}

export function buildHeaders(pageUrl = FRAGMENT_BASE_URL): Record<string, string> {
  validatePageUrl(pageUrl);
  return { ...BASE_HEADERS, referer: pageUrl, "x-aj-referer": pageUrl };
}

export function parseJsonResponse(response: HttpResponse): ApiObject {
  if (response.status !== 200) {
    throw new FragmentPageError(`HTTP ${response.status}.`, response.status);
  }
  try { return object(JSON.parse(response.text)); }
  catch { throw new ParseError("Expected a JSON object response."); }
}

/*
 * Normalize server application failures independently of transport failures.
 *
 * Verification requests are not interpreted as missing recipients. Minimum
 * Stars requirements and existing Premium subscriptions retain dedicated
 * exception categories for application-level handling.
 */
export function raiseApiError(result: ApiObject): void {
  if (result.need_verify) {
    throw new VerificationError("Fragment requires identity verification.");
  }
  if (!result.error) return;
  const message = text(result.error);
  const lower = message.toLowerCase();
  if (lower.includes("already subscribed")) {
    throw new AlreadySubscribedError("This account already has Telegram Premium.");
  }
  if (lower.includes("minimum") && lower.includes("star")) {
    throw new PaidMessageLimitError(message);
  }
  throw new FragmentAPIError(message);
}

export class FragmentTransport {
  private readonly hashes = new Map<string, { value: string; time: number }>();
  private readonly hashLock = new Mutex();

  constructor(readonly session: HttpSession) {}

  invalidate(): void {
    this.hashes.clear();
  }

  async getText(pageUrl: string, signal?: AbortSignal): Promise<string> {
    const response = await this.session.request(validatePageUrl(pageUrl), {
      headers: { accept: "text/html", referer: FRAGMENT_BASE_URL },
      signal,
    });
    if (response.status !== 200) {
      throw new FragmentPageError(`HTTP ${response.status}.`, response.status);
    }
    return response.text;
  }

  async hash(pageUrl: string, force = false, signal?: AbortSignal): Promise<string> {
    const url = validatePageUrl(pageUrl);
    return this.hashLock.run(async () => {
      const cached = this.hashes.get(url);
      if (!force && cached && performance.now() - cached.time < HASH_TTL) {
        return cached.value;
      }
      const html = (await this.getText(url, signal)).replace(/\\\//g, "/");
      const match = /\/api\?hash=([a-fA-F0-9]+)/.exec(html);
      if (!match) throw new ParseError("Fragment API hash was not found.");
      this.hashes.set(url, { value: match[1], time: performance.now() });
      return match[1];
    });
  }

  /*
   * Submit an explicit API method and permit one rejected-hash recovery.
   *
   * The method argument overrides any data.method property. Only a complete
   * application response containing Bad request permits a second submission.
   * Network errors and non-200 responses are never replayed by this method.
   */
  async call(
    method: string,
    data: ApiObject = {},
    pageUrl = FRAGMENT_BASE_URL,
    signal?: AbortSignal
  ): Promise<ApiObject> {
    validatePageUrl(pageUrl);
    const payload = { ...data, method };
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value != null) body.set(key, String(value));
    }
    let result: ApiObject = {};
    for (let attempt = 0; attempt < 2; attempt++) {
      const hash = await this.hash(pageUrl, attempt === 1, signal);
      result = parseJsonResponse(await this.session.request(
        `${FRAGMENT_API_URL}?hash=${encodeURIComponent(hash)}`,
        {
          method: "POST",
          headers: buildHeaders(pageUrl),
          body: body.toString(),
          signal,
        }
      ));
      if (text(result.error).trim().toLowerCase() !== "bad request") return result;
    }
    return result;
  }

  async page(pageUrl: string, signal?: AbortSignal): Promise<ApiObject> {
    const headers = buildHeaders(pageUrl);
    delete headers["content-type"];
    const response = await this.session.request(validatePageUrl(pageUrl), {
      headers, signal,
    });
    if (response.status !== 200) {
      throw new FragmentPageError(`HTTP ${response.status}.`, response.status);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(response.text); }
    catch {
      if (!/^\s*</.test(response.text)) {
        throw new ParseError("Page returned neither JSON nor HTML.");
      }
      let state: ApiObject = {};
      if (response.text.includes("ajInit(")) {
        const initial = embeddedObject(response.text, "ajInit(");
        if (isObject(initial.state)) state = initial.state;
      }
      return { h: response.text, s: state };
    }
    return object(parsed, "Page response");
  }
}