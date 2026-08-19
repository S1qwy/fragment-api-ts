import {
  FRAGMENT_BASE_URL,
  EVM_CHAIN_NAMES,
  EVM_TOKEN_DECIMALS,
  EVM_TOKEN_SYMBOLS,
  DEFAULT_TIMEOUT,
} from "../types/constants";
import { EvmInvoice } from "../types/results";
import { FragmentAPIError, FragmentPageError, ParseError, fmt } from "../exceptions";
import { buildHeaders } from "./http";

function parseAjInit(html: string): Record<string, any> {
  const match = /ajInit\((\{.*?\})\);/s.exec(html);
  if (!match) {
    throw new ParseError(
      fmt(ParseError.UNPARSEABLE, { context: "evm invoice page", exc: "ajInit block not found" })
    );
  }
  try {
    return JSON.parse(match[1]);
  } catch (exc) {
    throw new ParseError(
      fmt(ParseError.UNPARSEABLE, { context: "evm invoice ajInit JSON", exc: String(exc) })
    );
  }
}

function hexToInt(hexStr: string): number {
  const s = hexStr.trim().toLowerCase();
  if (s.startsWith("0x")) return parseInt(s, 16) || 0;
  return parseInt(s, 16) || 0;
}

function buildInvoiceUrl(
  pagePath: string,
  recipient: string,
  quantity?: number,
  months?: number,
  amount?: number,
  winners?: number
): string {
  const params: string[] = [`recipient=${recipient}`];
  if (quantity != null) params.push(`quantity=${quantity}`);
  if (months != null) params.push(`months=${months}`);
  if (amount != null) params.push(`amount=${amount}`);
  if (winners != null) params.push(`winners=${winners}`);
  return `${FRAGMENT_BASE_URL}${pagePath}?${params.join("&")}`;
}

function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Fetch a Fragment payment page and extract EVM invoice data.
 * Fragment redirects to an invoice page after the initial getXxxLink call
 * returns {"ok": true, "evm": true} for EVM payment methods.
 */
export async function fetchEvmInvoice(params: {
  cookies: Record<string, string>;
  pagePath: string;
  recipient: string;
  paymentMethod: string;
  quantity?: number;
  months?: number;
  amount?: number;
  winners?: number;
  timeout?: number;
}): Promise<EvmInvoice> {
  const timeout = params.timeout || DEFAULT_TIMEOUT;
  const invoiceUrl = buildInvoiceUrl(
    params.pagePath,
    params.recipient,
    params.quantity,
    params.months,
    params.amount,
    params.winners
  );

  const headers = buildHeaders(invoiceUrl);
  const fullHeaders: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": headers["user-agent"],
    cookie: cookieString(params.cookies),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(invoiceUrl, {
      method: "GET",
      headers: fullHeaders,
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new FragmentPageError(
        fmt(FragmentPageError.BAD_STATUS, { status: response.status, url: invoiceUrl })
      );
    }

    const text = await response.text();
    const ajData = parseAjInit(text);
    const state = ajData.state || {};

    const apiUrl: string = ajData.apiUrl || "";
    const apiHashMatch = /hash=([a-f0-9]+)/.exec(apiUrl);
    const apiHash = apiHashMatch ? apiHashMatch[1] : "";

    const reqId = state.invoiceReqId;
    const invoiceAddress = state.invoiceAddress;
    const invoiceToken = state.invoiceToken;
    const invoiceChainId = state.invoiceChainId;
    const invoiceAmountHex = state.invoiceAmount || "0x0";
    const expiresAt = state.invoiceExpiresAt || 0;

    if (!reqId || !invoiceAddress || !invoiceToken || !invoiceChainId) {
      throw new FragmentAPIError(
        "Invoice data missing from Fragment response. EVM payment may not be supported for this item."
      );
    }

    const tokenKey = invoiceToken.toLowerCase();
    const tokenDecimals = EVM_TOKEN_DECIMALS[tokenKey] || 6;
    const tokenSymbol = EVM_TOKEN_SYMBOLS[tokenKey] || params.paymentMethod.split("_")[0].toUpperCase();
    const chainName = EVM_CHAIN_NAMES[invoiceChainId] || `chain_${invoiceChainId}`;

    const invoiceAmountRaw = hexToInt(invoiceAmountHex);
    const invoiceAmount = invoiceAmountRaw / Math.pow(10, tokenDecimals);

    return {
      reqId,
      invoiceAddress,
      invoiceToken,
      invoiceChainId,
      invoiceChainName: chainName,
      invoiceAmountHex,
      invoiceAmount,
      invoiceAmountRaw,
      tokenSymbol,
      tokenDecimals,
      expiresAt,
      paymentMethod: params.paymentMethod,
      apiHash,
      pageUrl: invoiceUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}