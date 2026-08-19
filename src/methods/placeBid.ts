import { FragmentClient } from "../client";
import {
  ConfigurationError,
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  fmt,
} from "../exceptions";
import { DEVICE_FINGERPRINT, FRAGMENT_BASE_URL } from "../types/constants";
import { BidResult } from "../types/results";
import { buildHeaders, fetchFragmentHash, postFragmentApi } from "../utils/http";
import { buildAccountInfo, executeTransaction } from "../utils/wallet";

const TYPE_URL_MAP: Record<number, string> = {
  1: "username",
  3: "number",
  5: "gift",
};

function itemPageUrl(itemType: number, slug: string): string {
  const prefix = TYPE_URL_MAP[itemType] || "username";
  return `${FRAGMENT_BASE_URL}/${prefix}/${slug}`;
}

/**
 * Place a bid or buy-now on a Fragment marketplace item.
 */
export async function placeBid(
  client: FragmentClient,
  itemType: number,
  slug: string,
  bid: number
): Promise<BidResult> {
  if (![1, 3, 5].includes(itemType)) {
    throw new ConfigurationError(
      "Invalid item_type: must be 1 (username), 3 (number), or 5 (gift)."
    );
  }
  if (!Number.isInteger(bid) || bid < 1) {
    throw new ConfigurationError(
      "Invalid bid amount: must be a positive integer (GRAM)."
    );
  }

  client.requireWallet();

  try {
    const pageUrl = itemPageUrl(itemType, slug);
    const headers = buildHeaders(pageUrl);

    const fragmentHash = await fetchFragmentHash(
      client.cookies,
      headers,
      pageUrl,
      client.timeout
    );

    const account = await buildAccountInfo(client);
    const transaction = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      {
        method: "getBidLink",
        account: JSON.stringify(account),
        device: DEVICE_FINGERPRINT,
        transaction: "1",
        type: String(itemType),
        username: slug,
        bid: String(bid),
      },
      client.timeout
    );

    if (transaction.error) {
      throw new FragmentAPIError(String(transaction.error));
    }

    const confirmMethod = transaction.confirm_method || null;
    const confirmParams = transaction.confirm_params || {};

    const txResult = await executeTransaction(client, transaction);

    return {
      transactionId: txResult.txHash,
      itemType,
      slug,
      bid,
      confirmMethod,
      confirmId: confirmParams.id || null,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}