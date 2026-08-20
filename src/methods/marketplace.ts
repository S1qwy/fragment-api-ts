import { FragmentClient } from "../client";
import {
  ConfigurationError,
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  fmt,
} from "../exceptions";
import {
  DEVICE_FINGERPRINT,
  FRAGMENT_BASE_URL,
} from "../types/constants";
import {
  AdsWithdrawalConfirmResult,
  AdsWithdrawalInitResult,
  GatewayPriceInfo,
  GatewayRechargeResult,
  OfferResult,
  SubscriptionResult,
  TransactionResult,
} from "../types/results";
import { buildHeaders, fetchFragmentHash, postFragmentApi } from "../utils/http";
import { buildAccountInfo, executeTransaction } from "../utils/wallet";

const ITEM_TYPE_URL_PREFIX: Record<number, string> = {
  1: "username",
  3: "number",
  5: "gift",
};

const VALID_ITEM_TYPES = new Set([1, 3, 5]);

const GATEWAY_PAGE = `${FRAGMENT_BASE_URL}/gateway`;

function itemPageUrl(itemType: number, slug: string): string {
  const prefix = ITEM_TYPE_URL_PREFIX[itemType] || "username";
  return `${FRAGMENT_BASE_URL}/${prefix}/${slug}`;
}

/**
 * Make an offer to buy an unlisted username, number, or gift.
 */
export async function makeOffer(
  client: FragmentClient,
  itemType: number,
  slug: string,
  amount: number
): Promise<OfferResult> {
  if (!VALID_ITEM_TYPES.has(itemType)) {
    throw new ConfigurationError(
      `Invalid item_type: ${itemType}. Must be 1 (username), 3 (number), or 5 (gift).`
    );
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new ConfigurationError("Invalid offer amount: must be a positive integer (GRAM).");
  }

  client.requireWallet();

  try {
    const pageUrl = itemPageUrl(itemType, slug);

    const initRes = await client.call(
      "initOfferRequest",
      { type: String(itemType), username: slug },
      pageUrl
    );
    if (initRes.error) throw new FragmentAPIError(initRes.error);
    const reqId = initRes.req_id;
    if (!reqId) {
      throw new FragmentAPIError(
        fmt(FragmentAPIError.NO_REQUEST_ID, { context: "make offer" })
      );
    }

    const account = await buildAccountInfo(client);
    const transaction = await client.call(
      "getOfferLink",
      {
        account: JSON.stringify(account),
        device: DEVICE_FINGERPRINT,
        transaction: "1",
        id: reqId,
        amount: String(amount),
      },
      pageUrl
    );
    if (transaction.error) throw new FragmentAPIError(String(transaction.error));

    const txResult = await executeTransaction(client, transaction);

    return {
      transactionId: txResult.txHash,
      itemType,
      slug,
      amount,
      reqId,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Cancel an active auction if no bids have been placed.
 */
export async function cancelAuction(
  client: FragmentClient,
  itemType: number,
  slug: string
): Promise<TransactionResult> {
  if (!VALID_ITEM_TYPES.has(itemType)) {
    throw new ConfigurationError(
      `Invalid item_type: ${itemType}. Must be 1 (username), 3 (number), or 5 (gift).`
    );
  }

  client.requireWallet();

  try {
    const pageUrl = itemPageUrl(itemType, slug);
    const account = await buildAccountInfo(client);

    const transaction = await client.call(
      "getCancelAuctionLink",
      {
        account: JSON.stringify(account),
        device: DEVICE_FINGERPRINT,
        transaction: "1",
        type: String(itemType),
        username: slug,
      },
      pageUrl
    );
    if (transaction.error) throw new FragmentAPIError(String(transaction.error));

    return await executeTransaction(client, transaction);
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Subscribe to auction updates for an item.
 */
export async function subscribeToItem(
  client: FragmentClient,
  itemType: number,
  slug: string
): Promise<SubscriptionResult> {
  if (!VALID_ITEM_TYPES.has(itemType)) {
    throw new ConfigurationError(
      `Invalid item_type: ${itemType}. Must be 1 (username), 3 (number), or 5 (gift).`
    );
  }

  try {
    const pageUrl = itemPageUrl(itemType, slug);
    const result = await client.call(
      "subscribe",
      { type: String(itemType), username: slug },
      pageUrl
    );
    if (result.error) throw new FragmentAPIError(result.error);
    return { ok: true, subscribed: true, itemType, slug };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Unsubscribe from auction updates for an item.
 */
export async function unsubscribeFromItem(
  client: FragmentClient,
  itemType: number,
  slug: string
): Promise<SubscriptionResult> {
  if (!VALID_ITEM_TYPES.has(itemType)) {
    throw new ConfigurationError(
      `Invalid item_type: ${itemType}. Must be 1 (username), 3 (number), or 5 (gift).`
    );
  }

  try {
    const pageUrl = itemPageUrl(itemType, slug);
    const result = await client.call(
      "unsubscribe",
      { type: String(itemType), username: slug },
      pageUrl
    );
    if (result.error) throw new FragmentAPIError(result.error);
    return { ok: true, subscribed: false, itemType, slug };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Initialize Ads revenue withdrawal to wallet.
 */
export async function initAdsWithdrawal(
  client: FragmentClient,
  transactionId: string
): Promise<AdsWithdrawalInitResult> {
  client.requireTonToken();
  client.requireWallet();

  try {
    const walletInfo = await client.getWallet();
    const result = await client.call("initAdsRevenueWithdrawalRequest", {
      transaction: transactionId,
      wallet_address: walletInfo.address,
    });
    if (result.error) return { ok: false, error: result.error };
    return {
      ok: result.ok || false,
      confirmMessage: result.confirm_message,
      confirmButton: result.confirm_button,
      confirmHash: result.confirm_hash,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Confirm Ads revenue withdrawal after user approval.
 */
export async function confirmAdsWithdrawal(
  client: FragmentClient,
  transactionId: string,
  confirmHash: string
): Promise<AdsWithdrawalConfirmResult> {
  client.requireTonToken();
  client.requireWallet();

  try {
    const walletInfo = await client.getWallet();
    const result = await client.call("initAdsRevenueWithdrawalRequest", {
      transaction: transactionId,
      wallet_address: walletInfo.address,
      confirm_hash: confirmHash,
    });
    if (result.error) {
      return { ok: false, mode: "error", error: result.error };
    }
    return {
      ok: result.ok || false,
      needUpdate: result.need_update || false,
      mode: result.mode || "unknown",
      html: result.html,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Get price info for Telegram Gateway credits.
 */
export async function getGatewayPrice(
  client: FragmentClient,
  accountId: string,
  credits: number
): Promise<GatewayPriceInfo> {
  try {
    const result = await client.call(
      "updateGatewayPrices",
      { account: accountId, credits: String(credits) },
      GATEWAY_PAGE
    );
    return {
      credits,
      gramPrice: String(result.price || "0"),
      usdPrice: result.usd_price,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Recharge Telegram Gateway credits via TON payment.
 */
export async function rechargeGateway(
  client: FragmentClient,
  accountId: string,
  credits: number
): Promise<GatewayRechargeResult> {
  if (!Number.isInteger(credits) || credits < 1) {
    throw new ConfigurationError("Invalid credits amount: must be a positive integer.");
  }

  client.requireWallet();

  try {
    const initRes = await client.call(
      "initGatewayRechargeRequest",
      { account: accountId, credits: String(credits) },
      GATEWAY_PAGE
    );
    if (initRes.error) throw new FragmentAPIError(initRes.error);
    const reqId = initRes.req_id;
    if (!reqId) {
      throw new FragmentAPIError(
        fmt(FragmentAPIError.NO_REQUEST_ID, { context: "Gateway recharge" })
      );
    }

    const account = await buildAccountInfo(client);
    const transaction = await client.call(
      "getGatewayRechargeLink",
      {
        account: JSON.stringify(account),
        device: DEVICE_FINGERPRINT,
        transaction: "1",
        id: reqId,
      },
      GATEWAY_PAGE
    );
    if (transaction.error) throw new FragmentAPIError(String(transaction.error));

    const txResult = await executeTransaction(client, transaction);

    if (txResult.boc && reqId) {
      try {
        await client.confirmRequest(reqId, txResult.boc, "gateway");
      } catch {}
    }

    return {
      transactionId: txResult.txHash,
      accountId,
      credits,
      reqId,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}