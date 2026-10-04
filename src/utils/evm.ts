import { FragmentAPIError } from "../exceptions";
import {
  EVM_CHAIN_IDS, EVM_CHAIN_NAMES, FRAGMENT_BASE_URL,
} from "../types/constants";
import type { EvmInvoice } from "../types/results";
import { FragmentTransport } from "./http";
import {
  embeddedObject, formatUnits, integer, normalizePaymentMethod, object, text,
} from "./validation";

/*
 * Extract an unpaid EVM invoice using the original Fragment session.
 *
 * Network selection is checked against the requested payment method. Raw token
 * amounts remain exact decimal strings, and display amounts are also strings.
 * This function neither signs EVM transactions nor establishes fulfillment.
 */
export async function fetchEvmInvoice(
  transport: FragmentTransport,
  options: {
    pagePath: string;
    recipient: string;
    paymentMethod: string;
    quantity?: number;
    months?: number;
    amount?: number;
    winners?: number;
  }
): Promise<EvmInvoice> {
  const url = new URL(
    `${FRAGMENT_BASE_URL}/${options.pagePath.replace(/^\/+/, "")}`
  );
  for (const key of ["recipient", "quantity", "months", "amount", "winners"] as const) {
    const value = options[key];
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const initial = embeddedObject(await transport.getText(url.href), "ajInit(");
  const state = object(initial.state, "Invoice state");
  const method = normalizePaymentMethod(options.paymentMethod);
  const [symbol, chain] = method.split("_");
  const chainId = integer(Number(state.invoiceChainId), 1, Number.MAX_SAFE_INTEGER);
  if (EVM_CHAIN_IDS[chain] !== chainId) {
    throw new FragmentAPIError("Invoice network differs from selected payment method.");
  }
  const address = text(state.invoiceAddress);
  const token = text(state.invoiceToken);
  const reqId = text(state.invoiceReqId);
  const hexadecimal = text(state.invoiceAmount);
  if (
    !reqId || !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    !/^0x[0-9a-fA-F]{40}$/.test(token) ||
    !/^0x[0-9a-fA-F]+$/.test(hexadecimal)
  ) throw new FragmentAPIError("Incomplete or invalid EVM invoice.");
  const decimals = integer(Number(state.invoiceTokenDecimals ?? 6), 0, 36);
  const expiresAt = integer(Number(state.invoiceExpiresAt ?? 0), 0, 0xffffffff);
  if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new FragmentAPIError("EVM invoice has expired.");
  }
  const raw = BigInt(hexadecimal);
  return {
    reqId,
    invoiceAddress: address,
    invoiceToken: token,
    invoiceChainId: chainId,
    invoiceChainName: EVM_CHAIN_NAMES[chainId],
    invoiceAmountHex: hexadecimal,
    invoiceAmountRaw: raw.toString(),
    invoiceAmount: formatUnits(raw, decimals),
    tokenSymbol: symbol.toUpperCase(),
    tokenDecimals: decimals,
    expiresAt,
    paymentMethod: method,
    apiHash: /hash=([a-fA-F0-9]+)/.exec(text(initial.apiUrl))?.[1] ?? "",
    pageUrl: url.href,
  };
}