import { FragmentClient } from "../client";
import {
  ConfigurationError,
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  UserNotFoundError,
  VerificationError,
  fmt,
} from "../exceptions";
import {
  DEVICE_FINGERPRINT,
  EVM_PAYMENT_METHODS,
  GRAM_PAYMENT_METHODS,
  PREMIUM_GIVEAWAY_PAGE,
  PREMIUM_MONTHS_VALID,
  STARS_GIVEAWAY_PACKAGES,
  STARS_GIVEAWAY_PAGE,
  VALID_PAYMENT_METHODS,
} from "../types/constants";
import {
  EvmPaymentResult,
  GiveawayPremiumResult,
  GiveawayStarsResult,
} from "../types/results";
import { normalizePaymentMethod } from "./purchase";
import { fetchEvmInvoice } from "../utils/evm";
import { buildHeaders, fetchFragmentHash, postFragmentApi } from "../utils/http";
import { buildAccountInfo, executeTransaction } from "../utils/wallet";

function validateStarsGiveaway(amount: number, winners: number): void {
  if (!STARS_GIVEAWAY_PACKAGES.has(amount)) {
    throw new ConfigurationError(
      fmt(ConfigurationError.INVALID_GIVEAWAY_PACKAGE, {
        amount,
        packages: [...STARS_GIVEAWAY_PACKAGES].sort((a, b) => a - b).join(", "),
      })
    );
  }

  const maxWinners = Math.min(Math.max(Math.floor(amount / 100), 1), 10_000);
  if (!Number.isInteger(winners) || winners < 1 || winners > maxWinners) {
    throw new ConfigurationError(
      fmt(ConfigurationError.INVALID_GIVEAWAY_WINNERS, {
        winners,
        max_winners: maxWinners,
        amount,
      })
    );
  }
}

function normalizedSet(methods: Set<string>): Set<string> {
  return new Set([...methods].map(normalizePaymentMethod));
}

/**
 * Run a Telegram Stars giveaway for a channel.
 */
export async function giveawayStars(
  client: FragmentClient,
  channel: string,
  winners: number,
  amount: number,
  paymentMethod: string = "gram"
): Promise<GiveawayStarsResult | EvmPaymentResult> {
  validateStarsGiveaway(amount, winners);

  const apiPayment = normalizePaymentMethod(paymentMethod);
  if (!normalizedSet(VALID_PAYMENT_METHODS).has(apiPayment)) {
    throw new ConfigurationError(
      fmt(ConfigurationError.INVALID_PAYMENT_METHOD, {
        method: paymentMethod,
        supported: [...VALID_PAYMENT_METHODS].sort().join(", "),
      })
    );
  }

  const isGram = normalizedSet(GRAM_PAYMENT_METHODS).has(apiPayment);
  if (isGram) client.requireWallet();

  try {
    const headers = buildHeaders(STARS_GIVEAWAY_PAGE);
    const fragmentHash = await fetchFragmentHash(
      client.cookies,
      headers,
      STARS_GIVEAWAY_PAGE,
      client.timeout
    );

    const result = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      {
        method: "searchStarsGiveawayRecipient",
        query: channel,
        quantity: winners,
        stars: amount,
      },
      client.timeout
    );
    const recipient = (result.found || {}).recipient;
    if (!recipient) {
      throw new UserNotFoundError(fmt(UserNotFoundError.NOT_FOUND, { username: channel }));
    }

    const initResult = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      {
        method: "initGiveawayStarsRequest",
        recipient,
        quantity: String(winners),
        stars: String(amount),
        payment_method: apiPayment,
      },
      client.timeout
    );
    if (initResult.error) throw new FragmentAPIError(initResult.error);
    const reqId = initResult.req_id;
    if (!reqId) {
      throw new FragmentAPIError(
        fmt(FragmentAPIError.NO_REQUEST_ID, { context: "Stars giveaway" })
      );
    }

    if (isGram) {
      const account = await buildAccountInfo(client);
      const transaction = await postFragmentApi(
        client.cookies,
        fragmentHash,
        headers,
        {
          method: "getGiveawayStarsLink",
          account: JSON.stringify(account),
          device: DEVICE_FINGERPRINT,
          transaction: 1,
          id: reqId,
        },
        client.timeout
      );

      if (transaction.need_verify) {
        throw new VerificationError(VerificationError.KYC_REQUIRED);
      }

      if (!transaction.evm) {
        const txResult = await executeTransaction(client, transaction);
        if (txResult.boc && reqId) {
          try {
            await client.confirmRequest(reqId, txResult.boc, "stars/giveaway");
          } catch {}
        }
        return {
          transactionId: txResult.txHash,
          channel,
          winners,
          amount,
          paymentMethod,
        };
      }
    }

    const invoice = await fetchEvmInvoice({
      cookies: client.cookies,
      pagePath: "/stars/giveaway",
      recipient,
      paymentMethod: apiPayment,
      quantity: winners,
      amount,
      timeout: client.timeout,
    });
    return {
      itemKind: "giveaway_stars",
      target: channel,
      amount,
      paymentMethod,
      invoice,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Run a Telegram Premium giveaway for a channel.
 */
export async function giveawayPremium(
  client: FragmentClient,
  channel: string,
  winners: number,
  months: number = 3,
  paymentMethod: string = "gram"
): Promise<GiveawayPremiumResult | EvmPaymentResult> {
  if (!Number.isInteger(winners) || winners < 1 || winners > 24_000) {
    throw new ConfigurationError(ConfigurationError.INVALID_WINNERS_PREMIUM);
  }
  if (!PREMIUM_MONTHS_VALID.has(months)) {
    throw new ConfigurationError(ConfigurationError.INVALID_MONTHS);
  }

  const apiPayment = normalizePaymentMethod(paymentMethod);
  if (!normalizedSet(VALID_PAYMENT_METHODS).has(apiPayment)) {
    throw new ConfigurationError(
      fmt(ConfigurationError.INVALID_PAYMENT_METHOD, {
        method: paymentMethod,
        supported: [...VALID_PAYMENT_METHODS].sort().join(", "),
      })
    );
  }

  const isGram = normalizedSet(GRAM_PAYMENT_METHODS).has(apiPayment);
  if (isGram) client.requireWallet();

  try {
    const headers = buildHeaders(PREMIUM_GIVEAWAY_PAGE);
    const fragmentHash = await fetchFragmentHash(
      client.cookies,
      headers,
      PREMIUM_GIVEAWAY_PAGE,
      client.timeout
    );

    const result = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      {
        method: "searchPremiumGiveawayRecipient",
        query: channel,
        quantity: winners,
        months,
      },
      client.timeout
    );
    const recipient = (result.found || {}).recipient;
    if (!recipient) {
      throw new UserNotFoundError(fmt(UserNotFoundError.NOT_FOUND, { username: channel }));
    }

    const initResult = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      {
        method: "initGiveawayPremiumRequest",
        recipient,
        quantity: String(winners),
        months: String(months),
        payment_method: apiPayment,
      },
      client.timeout
    );
    if (initResult.error) throw new FragmentAPIError(initResult.error);
    const reqId = initResult.req_id;
    if (!reqId) {
      throw new FragmentAPIError(
        fmt(FragmentAPIError.NO_REQUEST_ID, { context: "Premium giveaway" })
      );
    }

    if (isGram) {
      const account = await buildAccountInfo(client);
      const transaction = await postFragmentApi(
        client.cookies,
        fragmentHash,
        headers,
        {
          method: "getGiveawayPremiumLink",
          account: JSON.stringify(account),
          device: DEVICE_FINGERPRINT,
          transaction: 1,
          id: reqId,
        },
        client.timeout
      );

      if (transaction.need_verify) {
        throw new VerificationError(VerificationError.KYC_REQUIRED);
      }

      if (!transaction.evm) {
        const txResult = await executeTransaction(client, transaction);
        if (txResult.boc && reqId) {
          try {
            await client.confirmRequest(reqId, txResult.boc, "premium/giveaway");
          } catch {}
        }
        return {
          transactionId: txResult.txHash,
          channel,
          winners,
          amount: months,
          paymentMethod,
        };
      }
    }

    const invoice = await fetchEvmInvoice({
      cookies: client.cookies,
      pagePath: "/premium/giveaway",
      recipient,
      paymentMethod: apiPayment,
      winners,
      months,
      timeout: client.timeout,
    });
    return {
      itemKind: "giveaway_premium",
      target: channel,
      amount: months,
      paymentMethod,
      invoice,
    };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}