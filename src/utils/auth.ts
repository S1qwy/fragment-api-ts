import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, WalletContractV5R1, beginCell } from "@ton/ton";
import * as nacl from "tweetnacl";
import * as crypto from "crypto";
import { FragmentPageError, UnexpectedError, fmt } from "../exceptions";
import { BASE_HEADERS, FRAGMENT_BASE_URL } from "../types/constants";

const TELEGRAM_CLIENT_ID = "5444323279";
const TELEGRAM_OAUTH_BASE = "https://oauth.telegram.org";
const TELEGRAM_BASE_PARAMS =
  `client_id=${TELEGRAM_CLIENT_ID}` +
  `&origin=https%3A%2F%2Ffragment.com` +
  `&return_to=https%3A%2F%2Ffragment.com%2F` +
  `&scope=openid%20profile%20telegram%3Abot_access` +
  `&redirect_uri=https%3A%2F%2Ffragment.com%2F` +
  `&response_type=post_message`;

type OnStatusFn = (status: string, payload: any) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseCookiesFromHeaders(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookies = headers.getSetCookie?.() || [];
  for (const sc of setCookies) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (m) cookies[m[1]] = m[2];
  }
  return cookies;
}

function parseInitPage(html: string): [string, string] {
  const matchAj = /ajInit\((.*?)\);/.exec(html);
  if (!matchAj) {
    throw new FragmentPageError(fmt(FragmentPageError.HASH_NOT_FOUND, { url: FRAGMENT_BASE_URL }));
  }
  const ajData = JSON.parse(matchAj[1]);
  const apiHash = (ajData.apiUrl || "").split("hash=").pop() || "";

  const matchWallet = /Wallet\.init\((.*?)\);/.exec(html);
  if (!matchWallet) {
    throw new FragmentPageError(fmt(FragmentPageError.HASH_NOT_FOUND, { url: FRAGMENT_BASE_URL }));
  }
  const tonProofPayload = JSON.parse(matchWallet[1]).ton_proof || "";

  return [apiHash, tonProofPayload];
}

async function generateProof(
  mnemonic: string[],
  walletVersion: string,
  tonProofPayload: string
): Promise<[Record<string, any>, Record<string, any>, Record<string, any>]> {
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  let wallet: any;
  if (walletVersion.toUpperCase() === "V4R2") {
    wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  } else {
    wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  }

  const rawAddress = wallet.address.toRawString();
  const [workchainStr, addrHashHex] = rawAddress.split(":");
  const workchain = parseInt(workchainStr, 10);

  const stateInit = wallet.init;
  const stateInitBoc = beginCell()
    .store((b: any) => {
      b.storeRef(stateInit!.code!);
      b.storeRef(stateInit!.data!);
    })
    .endCell()
    .toBoc();
  const stateInitB64 = stateInitBoc.toString("base64");

  const domain = "fragment.com";
  const timestamp = Math.floor(Date.now() / 1000);

  const domainBytes = Buffer.from(domain, "utf-8");
  const payloadBytes = Buffer.from(tonProofPayload, "utf-8");

  const wcBuf = Buffer.alloc(4);
  wcBuf.writeInt32BE(workchain, 0);

  const domainLenBuf = Buffer.alloc(4);
  domainLenBuf.writeUInt32LE(domainBytes.length, 0);

  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64LE(BigInt(timestamp), 0);

  const msg = Buffer.concat([
    Buffer.from("ton-proof-item-v2/", "utf-8"),
    wcBuf,
    Buffer.from(addrHashHex, "hex"),
    domainLenBuf,
    domainBytes,
    tsBuf,
    payloadBytes,
  ]);

  const msgHash = crypto.createHash("sha256").update(msg).digest();
  const signPayload = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from("ton-connect", "utf-8"),
    msgHash,
  ]);
  const finalHash = crypto.createHash("sha256").update(signPayload).digest();

  const signature = nacl.sign.detached(finalHash, keyPair.secretKey);
  const signatureB64 = Buffer.from(signature).toString("base64");

  const accountData = {
    address: rawAddress,
    chain: "-239",
    walletStateInit: stateInitB64,
    publicKey: keyPair.publicKey.toString("hex"),
  };

  const deviceData = {
    platform: "android",
    appName: "Tonkeeper",
    appVersion: "26.04.3",
    maxProtocolVersion: 2,
    features: [
      "SendTransaction",
      { name: "SignData", types: ["text", "binary", "cell"] },
      { name: "SendTransaction", maxMessages: 255 },
    ],
  };

  const proofData = {
    timestamp,
    domain: { lengthBytes: domainBytes.length, value: domain },
    payload: tonProofPayload,
    signature: signatureB64,
  };

  return [accountData, deviceData, proofData];
}

function printQrAscii(data: string): void {
  try {
    const qr = require("qrcode-terminal");
    qr.generate(data, { small: true });
  } catch {
    console.log(`[!] qrcode-terminal not installed. Open URL manually: ${data}`);
  }
}

async function pollTelegramAuth(
  sessionCookies: Record<string, string>,
  qtoken: string,
  onStatus?: OnStatusFn
): Promise<string> {
  let consumed = false;
  let currentQtoken = qtoken;

  while (true) {
    const pollUrl = `${TELEGRAM_OAUTH_BASE}/auth/login?${TELEGRAM_BASE_PARAMS}&qtoken=${currentQtoken}`;

    try {
      const res = await fetch(pollUrl, {
        method: "POST",
        headers: {
          "User-Agent": BASE_HEADERS["user-agent"],
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          cookie: cookieString(sessionCookies),
        },
        body: "",
      });

      const data: any = await res.json();
      const status = data?.status;

      if (status === "refresh") {
        currentQtoken = data.qtoken || currentQtoken;
        onStatus?.("refresh", currentQtoken);
      } else if (status === "consumed") {
        if (!consumed) {
          consumed = true;
          onStatus?.("consumed", null);
        }
      } else if (status === "confirmed") {
        onStatus?.("confirmed", null);

        const pushUrl = `${TELEGRAM_OAUTH_BASE}/auth/push?${TELEGRAM_BASE_PARAMS}`;
        const pushRes = await fetch(pushUrl, {
          headers: {
            "User-Agent": BASE_HEADERS["user-agent"],
            cookie: cookieString(sessionCookies),
          },
        });
        const pushText = await pushRes.text();
        const m = /#tgAuthResult=([A-Za-z0-9_\-]+)/.exec(pushText);
        if (!m) {
          throw new UnexpectedError("Failed to extract tgAuthResult from push response.");
        }
        return m[1];
      }
    } catch (exc) {
      if (exc instanceof UnexpectedError) throw exc;
    }

    await sleep(1000);
  }
}

async function telegramAuthQr(
  sessionCookies: Record<string, string>,
  printQr: boolean = true,
  onStatus?: OnStatusFn
): Promise<string> {
  const url = `${TELEGRAM_OAUTH_BASE}/auth/auth?${TELEGRAM_BASE_PARAMS}&quick_auth=new`;
  const res = await fetch(url, {
    headers: { "User-Agent": BASE_HEADERS["user-agent"], cookie: cookieString(sessionCookies) },
  });
  const text = await res.text();

  const m = /setToken\('([^']+)'\)/.exec(text);
  if (!m) throw new UnexpectedError("Failed to fetch QR qtoken from Telegram OAuth.");

  const qtoken = m[1];
  const tgLink = `https://t.me/oauth?startapp=${qtoken}`;

  onStatus?.("qr_link", tgLink);
  if (printQr) {
    console.log(`\n[*] Scan this QR (or open the link):\n    ${tgLink}\n`);
    printQrAscii(tgLink);
  }

  return pollTelegramAuth(sessionCookies, qtoken, onStatus);
}

async function telegramAuthPhone(
  sessionCookies: Record<string, string>,
  phone: string,
  onStatus?: OnStatusFn
): Promise<string> {
  const authPageUrl = `${TELEGRAM_OAUTH_BASE}/auth/auth?${TELEGRAM_BASE_PARAMS}&phone_login=1`;
  await fetch(authPageUrl, {
    headers: { "User-Agent": BASE_HEADERS["user-agent"], cookie: cookieString(sessionCookies) },
  });

  const digits = phone.replace(/\D/g, "");
  const postUrl = `${TELEGRAM_OAUTH_BASE}/auth/request?${TELEGRAM_BASE_PARAMS}`;
  const res = await fetch(postUrl, {
    method: "POST",
    headers: {
      "User-Agent": BASE_HEADERS["user-agent"],
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: TELEGRAM_OAUTH_BASE,
      Referer: authPageUrl,
      cookie: cookieString(sessionCookies),
    },
    body: `phone=${digits}`,
  });

  const qtoken = (await res.text()).trim().replace(/['"]/g, "");
  if (!qtoken || qtoken.toLowerCase() === "session expired" || qtoken.length > 100) {
    throw new UnexpectedError(`Telegram OAuth phone request failed: ${qtoken}`);
  }

  onStatus?.("phone_sent", qtoken);
  return pollTelegramAuth(sessionCookies, qtoken, onStatus);
}

/**
 * Perform full Fragment authentication and return session cookies.
 *
 * First obtains stel_ssid / stel_dt / stel_ton_token via TON wallet proof.
 * If stel_token is missing, runs Telegram OAuth (QR by default, or phone
 * confirmation if phone is provided) and finalizes the login via the
 * tgAuthResult redirect.
 */
export async function authenticate(params: {
  seed: string;
  walletVersion?: string;
  phone?: string;
  printQr?: boolean;
  onStatus?: OnStatusFn;
  timeout?: number;
}): Promise<Record<string, string>> {
  const walletVersion = params.walletVersion || "V5R1";
  const printQr = params.printQr !== false;
  const timeout = params.timeout || 30000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const initRes = await fetch(`${FRAGMENT_BASE_URL}/`, {
      headers: {
        "User-Agent": BASE_HEADERS["user-agent"],
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "stel_dt=-180",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const initHtml = await initRes.text();
    const initCookies = parseCookiesFromHeaders(initRes.headers);
    initCookies["stel_dt"] = "-180";

    const [apiHash, tonProofPayload] = parseInitPage(initHtml);
    const mnemonic = params.seed.trim().split(/\s+/);
    const [accountData, deviceData, proofData] = await generateProof(
      mnemonic,
      walletVersion,
      tonProofPayload
    );

    const formData = new URLSearchParams({
      account: JSON.stringify(accountData),
      device: JSON.stringify(deviceData),
      proof: JSON.stringify(proofData),
      method: "checkTonProofAuth",
    });

    const apiUrl = `${FRAGMENT_BASE_URL}/api?hash=${apiHash}`;
    const authRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "User-Agent": BASE_HEADERS["user-agent"],
        Accept: "application/json, text/javascript, */*; q=0.01",
        Origin: FRAGMENT_BASE_URL,
        Referer: `${FRAGMENT_BASE_URL}/`,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: cookieString(initCookies),
      },
      body: formData.toString(),
    });

    const authCookies = parseCookiesFromHeaders(authRes.headers);
    const cookies = { ...initCookies, ...authCookies };

    if (cookies.stel_token) {
      return cookies;
    }

    let tgAuthResult: string;
    if (params.phone) {
      tgAuthResult = await telegramAuthPhone(cookies, params.phone, params.onStatus);
    } else {
      tgAuthResult = await telegramAuthQr(cookies, printQr, params.onStatus);
    }

    const tgFormData = new URLSearchParams({
      auth: tgAuthResult,
      method: "logIn",
    });

    const tgRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "User-Agent": BASE_HEADERS["user-agent"],
        Accept: "application/json, text/javascript, */*; q=0.01",
        Origin: FRAGMENT_BASE_URL,
        Referer: `${FRAGMENT_BASE_URL}/`,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: cookieString(cookies),
      },
      body: tgFormData.toString(),
    });

    const finalCookies = parseCookiesFromHeaders(tgRes.headers);
    return { ...cookies, ...finalCookies };
  } catch (exc) {
    if (exc instanceof FragmentPageError || exc instanceof UnexpectedError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}