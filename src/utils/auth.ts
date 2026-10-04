import { createHash } from "node:crypto";
import { mnemonicToPrivateKey, sign } from "@ton/crypto";
import qr from "qrcode-terminal";
import { CookieError, FragmentAPIError, ParseError } from "../exceptions";
import {
  AUTH_REQUIRED_COOKIE_KEYS, AUTH_TIMEOUT, DEFAULT_TIMEOUT, DEVICE_INFO,
  FRAGMENT_BASE_URL, REQUIRED_COOKIE_KEYS_WALLET, TELEGRAM_OAUTH_BASE,
} from "../types/constants";
import type { Cookies, WalletVersion } from "../types/results";
import { sleep } from "./async";
import {
  FragmentTransport, HttpSession, parseJsonResponse, raiseApiError,
} from "./http";
import {
  embeddedObject, normalizeWalletVersion, positiveTimeout,
  text, validateCookieKeys, validateSeed,
} from "./validation";
import { deriveAccount, type WalletAdapter } from "./wallet";

export type AuthStatus = "qr_link" | "phone_sent" | "consumed" | "confirmed";
export type OnStatus = (
  status: AuthStatus, payload: string | null
) => void | Promise<void>;

export interface AuthenticateOptions {
  seed: string;
  walletVersion?: string;
  walletAdapter?: WalletAdapter;
  phone?: string;
  printQr?: boolean;
  onStatus?: OnStatus;
  timeout?: number;
  authTimeout?: number;
  proxy?: string | null;
}

/*
 * Authenticate wallet ownership on an existing Fragment session.
 *
 * The proof binds the public key to the Fragment domain, challenge payload,
 * wallet address, and current timestamp. It does not authenticate a Telegram
 * user and does not turn a restricted session into an account-management mode.
 */
export async function authTonProof(
  transport: FragmentTransport,
  seedValue: string,
  version: WalletVersion = "V5R1",
  adapter?: WalletAdapter
): Promise<Cookies> {
  const seed = await validateSeed(seedValue);
  await transport.session.importCookies({ stel_dt: "-180" });
  const html = await transport.getText(`${FRAGMENT_BASE_URL}/`);
  const challenge = embeddedObject(html, "Wallet.init(").ton_proof;
  if (typeof challenge !== "string" || !challenge) {
    throw new FragmentAPIError("Fragment did not provide a TON proof challenge.");
  }
  const account = await deriveAccount(seed, version, adapter);
  const keys = await mnemonicToPrivateKey(seed.split(" "));
  if (account.publicKey.toLowerCase() !== keys.publicKey.toString("hex")) {
    throw new FragmentAPIError("Authentication adapter public key differs from mnemonic.");
  }
  const [workchain, addressHash] = account.address.split(":");
  const domain = Buffer.from("fragment.com");
  const timestamp = Math.floor(Date.now() / 1000);
  const wc = Buffer.alloc(4);
  wc.writeInt32BE(Number(workchain));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(domain.length);
  const time = Buffer.alloc(8);
  time.writeBigUInt64LE(BigInt(timestamp));
  const message = Buffer.concat([
    Buffer.from("ton-proof-item-v2/"),
    wc, Buffer.from(addressHash, "hex"), length, domain, time,
    Buffer.from(challenge),
  ]);
  const digest = createHash("sha256").update(Buffer.concat([
    Buffer.from([255, 255]),
    Buffer.from("ton-connect"),
    createHash("sha256").update(message).digest(),
  ])).digest();
  const proof = {
    timestamp,
    domain: { lengthBytes: domain.length, value: "fragment.com" },
    payload: challenge,
    signature: sign(digest, keys.secretKey).toString("base64"),
  };
  raiseApiError(await transport.call("checkTonProofAuth", {
    account: JSON.stringify(account),
    device: JSON.stringify(DEVICE_INFO),
    proof: JSON.stringify(proof),
  }));
  const cookies = await transport.session.exportCookies();
  validateCookieKeys(cookies, AUTH_REQUIRED_COOKIE_KEYS);
  transport.invalidate();
  return cookies;
}

/*
 * Complete explicit Telegram OAuth within a caller-controlled total deadline.
 *
 * QR links are intentionally displayed only for interactive authentication.
 * Session cookies and raw OAuth result tokens are never printed. Terminal
 * rejection states stop polling rather than looping forever.
 */
async function telegramLogin(
  session: HttpSession,
  options: AuthenticateOptions,
  signal: AbortSignal
): Promise<string> {
  const query = new URLSearchParams({
    client_id: "5444323279",
    origin: FRAGMENT_BASE_URL,
    return_to: `${FRAGMENT_BASE_URL}/`,
    scope: "openid profile telegram:bot_access",
    redirect_uri: `${FRAGMENT_BASE_URL}/`,
    response_type: "post_message",
  }).toString();
  const page = `${TELEGRAM_OAUTH_BASE}/auth/auth?${query}`;
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    "x-requested-with": "XMLHttpRequest",
    origin: TELEGRAM_OAUTH_BASE,
    referer: page,
  };
  const request = async (url: string, body?: string) => {
    const response = await session.request(url, {
      method: body === undefined ? "GET" : "POST",
      headers, body, signal,
    });
    if (response.status !== 200) {
      throw new FragmentAPIError(`Telegram OAuth returned HTTP ${response.status}.`);
    }
    return response;
  };
  const display = async (token: string): Promise<void> => {
    const link = `https://t.me/oauth?startapp=${encodeURIComponent(token)}`;
    await options.onStatus?.("qr_link", link);
    if (options.printQr !== false && !options.phone) {
      console.log(link);
      qr.generate(link, { small: true });
    }
  };

  let token: string;
  if (options.phone) {
    await request(`${page}&phone_login=1`);
    const response = await request(
      `${TELEGRAM_OAUTH_BASE}/auth/request?${query}`,
      new URLSearchParams({ phone: options.phone.replace(/\D/g, "") }).toString()
    );
    token = response.text.trim().replace(/^['"]|['"]$/g, "");
    if (!token || token.length > 100 || /expired/i.test(token)) {
      throw new FragmentAPIError("Telegram rejected the phone login request.");
    }
    await options.onStatus?.("phone_sent", null);
  } else {
    const response = await request(`${page}&quick_auth=new`);
    const match = /setToken\(['"]([^'"]+)['"]\)/.exec(response.text);
    if (!match) throw new ParseError("Telegram QR token was not found.");
    token = match[1];
    await display(token);
  }

  while (true) {
    signal.throwIfAborted();
    const result = parseJsonResponse(await request(
      `${TELEGRAM_OAUTH_BASE}/auth/login?${query}&qtoken=${encodeURIComponent(token)}`,
      ""
    ));
    const status = text(result.status);
    if (status === "refresh") {
      token = text(result.qtoken, token);
      await display(token);
    } else if (status === "consumed") {
      await options.onStatus?.("consumed", null);
    } else if (status === "confirmed") {
      await options.onStatus?.("confirmed", null);
      const pushed = await request(`${TELEGRAM_OAUTH_BASE}/auth/push?${query}`);
      const match = /tgAuthResult=([A-Za-z0-9_-]+)/.exec(pushed.text);
      if (!match) throw new ParseError("Telegram OAuth result was not found.");
      return match[1];
    } else if (["expired", "declined", "cancelled"].includes(status)) {
      throw new FragmentAPIError(`Telegram OAuth ended with status ${status}.`);
    }
    await sleep(1000, signal);
  }
}

export async function authenticate(options: AuthenticateOptions): Promise<Cookies> {
  const timeout = positiveTimeout(options.timeout ?? DEFAULT_TIMEOUT);
  const version = normalizeWalletVersion(options.walletVersion ?? "V5R1");
  const session = new HttpSession([FRAGMENT_BASE_URL], timeout, options.proxy);
  const transport = new FragmentTransport(session);
  try {
    const cookies = await authTonProof(
      transport, options.seed, version, options.walletAdapter
    );
    if (!cookies.stel_token) {
      const telegram = new HttpSession(
        [TELEGRAM_OAUTH_BASE], timeout, options.proxy
      );
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        positiveTimeout(options.authTimeout ?? AUTH_TIMEOUT)
      );
      try {
        const token = await telegramLogin(telegram, options, controller.signal);
        raiseApiError(await transport.call("logIn", { auth: token }));
      } catch (error) {
        if (controller.signal.aborted) {
          throw new CookieError("Telegram authentication timed out.");
        }
        throw error;
      } finally {
        clearTimeout(timer);
        await telegram.close();
      }
    }
    const result = await session.exportCookies();
    validateCookieKeys(result, REQUIRED_COOKIE_KEYS_WALLET);
    return result;
  } finally {
    await session.close();
  }
}