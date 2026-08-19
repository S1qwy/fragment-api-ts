import { FragmentClient } from "../client";
import {
  ConfigurationError,
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  UserNotFoundError,
  VerificationError,
  WalletError,
  fmt,
} from "../exceptions";
import {
  ADS_TOPUP_PAGE,
  BATCH_PAYMENT_METHODS,
  DEVICE_FINGERPRINT,
  EVM_PAYMENT_METHODS,
  GRAM_PAYMENT_METHODS,
  GRAM_TOPUP_MAX,
  GRAM_TOPUP_MIN,
  MIN_GRAM_BALANCE,
  PREMIUM_GIFT_PAGE,
  PREMIUM_MONTHS_VALID,
  PURCHASE_TYPES,
  STARS_PAGE,
  STARS_PURCHASE_MAX,
  STARS_PURCHASE_MIN,
  VALID_PAYMENT_METHODS,
  WALLET_MAX_MESSAGES,
} from "../types/constants";
import {
  BatchItemResult,
  BatchResult,
  EvmPaymentResult,
  PurchaseItem,
  PurchaseResult,
} from "../types/results";
import { fetchEvmInvoice } from "../utils/evm";
import { buildHeaders, fetchFragmentHash, postFragmentApi } from "../utils/http";
import {
  buildAccountInfo,
  executeBatchTransaction,
  executeTransaction,
  fetchWalletInfo,
} from "../utils/wallet";

const TYPE_PAGE_MAP: Record<string, string> = {
  stars: STARS_PAGE,
  premium: PREMIUM_GIFT_PAGE,
  gram: ADS_TOPUP_PAGE,
  ton: ADS_TOPUP_PAGE,
};

const TYPE_SEARCH_METHOD: Record<string, string> = {
  stars: "searchStarsRecipient",
  premium: "searchPremiumGiftRecipient",
  gram: "searchAdsTopupRecipient",
  ton: "searchAdsTopupRecipient",
};

const TYPE_INIT_METHOD: Record<string, string> = {
  stars: "initBuyStarsRequest",
  premium: "initGiftPremiumRequest",
  gram: "initAdsTopupRequest",
  ton: "initAdsTopupRequest",
};

const TYPE_LINK_METHOD: Record<string, string> = {
  stars: "getBuyStarsLink",
  premium: "getGiftPremiumLink",
  gram: "getAdsTopupLink",
  ton: "getAdsTopupLink",
};

const TYPE_CONFIRM_REFERER: Record<string, string> = {
  stars: "stars/buy",
  premium: "premium/gift",
  gram: "ads/topup",
  ton: "ads/topup",
};

const TYPE_EVM_PATH: Record<string, string> = {
  stars: "/stars/buy",
  premium: "/premium/gift",
};

export function normalizePaymentMethod(method: string): string {
  if (method === "gram") return "ton";
  if (method === "usdt_gram") return "usdt_ton";
  return method;
}

function normalizedSet(methods: Set<string>): Set<string> {
  return new Set([...methods].map(normalizePaymentMethod));
}

function validateSingleItem(
  itemType: string,
  username: string,
  amount?: number | null,
  months?: number | null
): void {
  if (!PURCHASE_TYPES.has(itemType)) {
    throw new ConfigurationError(
      `Invalid purchase type '${itemType}'. Must be one of: ${[...PURCHASE_TYPES].sort().join(", ")}.`
    );
  }
  if (!username || !username.trim()) {
    throw new ConfigurationError("Recipient username is required.");
  }
  if (itemType === "premium") {
    if (!months || !PREMIUM_MONTHS_VALID.has(months)) {
      throw new ConfigurationError(ConfigurationError.INVALID_MONTHS);
    }
  } else if (itemType === "stars") {
    if (
      !Number.isInteger(amount) ||
      amount == null ||
      amount < STARS_PURCHASE_MIN ||
      amount > STARS_PURCHASE_MAX
    ) {
      throw new ConfigurationError(ConfigurationError.INVALID_STARS_AMOUNT);
    }
  } else if (itemType === "gram" || itemType === "ton") {
    if (
      !Number.isInteger(amount) ||
      amount == null ||
      amount < GRAM_TOPUP_MIN ||
      amount > GRAM_TOPUP_MAX
    ) {
      throw new ConfigurationError(ConfigurationError.INVALID_GRAM_AMOUNT);
    }
  }
}

async function resolveRecipient(
  cookies: Record<string, string>,
  fragmentHash: string,
  headers: Record<string, string>,
  itemType: string,
  username: string,
  months?: number | null,
  timeout?: number
): Promise<string> {
  const searchMethod = TYPE_SEARCH_METHOD[itemType];
  const payload: Record<string, any> = { method: searchMethod, query: username };

  if (itemType === "stars") payload.quantity = "";
  else if (itemType === "premium") payload.months = months || 3;

  if (itemType === "gram" || itemType === "ton") {
    await postFragmentApi(
      cookies,
      fragmentHash,
      headers,
      { method: "updateAdsTopupState", mode: "new" },
      timeout
    );
  }

  const result = await postFragmentApi(cookies, fragmentHash, headers, payload, timeout);
  const recipient = (result.found || {}).recipient;
  if (!recipient) {
    throw new UserNotFoundError(fmt(UserNotFoundError.NOT_FOUND, { username }));
  }
  return recipient;
}

async function initRequest(
  cookies: Record<string, string>,
  fragmentHash: string,
  headers: Record<string, string>,
  itemType: string,
  recipient: string,
  amount?: number | null,
  months?: number | null,
  paymentMethod: string = "gram",
  timeout?: number
): Promise<string> {
  const initMethod = TYPE_INIT_METHOD[itemType];
  const apiPayment = normalizePaymentMethod(paymentMethod);
  const payload: Record<string, any> = { method: initMethod, recipient };

  if (itemType === "stars") {
    payload.quantity = String(amount);
    payload.payment_method = apiPayment;
  } else if (itemType === "premium") {
    await postFragmentApi(
      cookies,
      fragmentHash,
      headers,
      {
        method: "updatePremiumState",
        mode: "new",
        lv: "false",
        dh: String(Math.floor(Date.now() / 1000)),
      },
      timeout
    );
    payload.months = String(months);
    payload.payment_method = apiPayment;
  } else if (itemType === "gram" || itemType === "ton") {
    payload.amount = amount;
  }

  const result = await postFragmentApi(cookies, fragmentHash, headers, payload, timeout);
  if (result.error) throw new FragmentAPIError(result.error);

  const reqId = result.req_id;
  if (!reqId) {
    throw new FragmentAPIError(
      fmt(FragmentAPIError.NO_REQUEST_ID, { context: `${itemType} purchase` })
    );
  }
  return reqId;
}

async function getTransactionLink(
  cookies: Record<string, string>,
  fragmentHash: string,
  headers: Record<string, string>,
  itemType: string,
  reqId: string,
  account: Record<string, any>,
  showSender: boolean,
  timeout?: number
): Promise<Record<string, any>> {
  const linkMethod = TYPE_LINK_METHOD[itemType];
  const payload: Record<string, any> = {
    method: linkMethod,
    account: JSON.stringify(account),
    device: DEVICE_FINGERPRINT,
    transaction: 1,
    id: reqId,
    show_sender: showSender ? 1 : 0,
  };

  const transaction = await postFragmentApi(cookies, fragmentHash, headers, payload, timeout);
  if (transaction.need_verify) {
    throw new VerificationError(VerificationError.KYC_REQUIRED);
  }
  if (transaction.error) {
    throw new FragmentAPIError(String(transaction.error));
  }
  return transaction;
}

async function executeBatchFlow(
  client: FragmentClient,
  items: Record<string, any>[],
  paymentMethod: string
): Promise<BatchResult> {
  const apiPayment = normalizePaymentMethod(paymentMethod);
  const normalizedBatch = normalizedSet(BATCH_PAYMENT_METHODS);

  if (!normalizedBatch.has(apiPayment)) {
    throw new ConfigurationError(
      `Batch purchases only support GRAM payment methods (${[...BATCH_PAYMENT_METHODS].sort().join(", ")}). Got: '${paymentMethod}'.`
    );
  }

  if (!items.length) {
    return { total: 0, succeeded: 0, failed: 0, chunksSent: 0, items: [] };
  }

  client.requireWallet();

  for (const raw of items) {
    validateSingleItem(raw.type, raw.username, raw.amount, raw.months);
  }

  const cookies = client.requireCookies();
  const maxMessages = WALLET_MAX_MESSAGES[client.walletVersion] || 4;

  let account: Record<string, any>;
  let walletInfo: any;
  try {
    account = await buildAccountInfo(client);
    walletInfo = await fetchWalletInfo(client);
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }

  const prepared: Record<string, any>[] = [];

  try {
    const headers = buildHeaders(STARS_PAGE);
    const fragmentHash = await fetchFragmentHash(cookies, headers, STARS_PAGE, client.timeout);

    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      const itemType = item.type;
      const username = String(item.username).trim();
      const showSender = item.show_sender !== false;
      const pageUrl = TYPE_PAGE_MAP[itemType];
      const hdr = buildHeaders(pageUrl);

      try {
        const recipient = await resolveRecipient(
          cookies,
          fragmentHash,
          hdr,
          itemType,
          username,
          item.months,
          client.timeout
        );
        const reqId = await initRequest(
          cookies,
          fragmentHash,
          hdr,
          itemType,
          recipient,
          item.amount,
          item.months,
          paymentMethod,
          client.timeout
        );
        const transaction = await getTransactionLink(
          cookies,
          fragmentHash,
          hdr,
          itemType,
          reqId,
          account,
          showSender,
          client.timeout
        );

        const inner = transaction.transaction || {};
        const messages = inner.messages || [];

        if (!messages.length) {
          prepared.push({
            itemIdx,
            item,
            ok: false,
            error: "Fragment returned empty transaction messages.",
            messages: [],
            reqId,
          });
        } else {
          prepared.push({ itemIdx, item, ok: true, error: null, messages, reqId });
        }
      } catch (exc) {
        prepared.push({
          itemIdx,
          item,
          ok: false,
          error: String(exc),
          messages: [],
          reqId: null,
        });
      }
    }
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }

  const allMessages: Record<string, any>[] = [];
  const messageToPreparedIdx: number[] = [];

  for (let prepIdx = 0; prepIdx < prepared.length; prepIdx++) {
    const entry = prepared[prepIdx];
    if (entry.ok && entry.messages.length) {
      for (const msg of entry.messages) {
        allMessages.push(msg);
        messageToPreparedIdx.push(prepIdx);
      }
    }
  }

  const totalNanograms = allMessages.reduce(
    (sum, msg) => sum + Number(BigInt(msg.amount || 0)),
    0
  );
  const totalGramNeeded = totalNanograms / 1_000_000_000;
  const requiredWithGas = totalGramNeeded + MIN_GRAM_BALANCE;

  if (walletInfo.gramBalance < requiredWithGas) {
    throw new WalletError(
      fmt(WalletError.LOW_GRAM_BALANCE, {
        balance: walletInfo.gramBalance.toFixed(4),
        required: requiredWithGas.toFixed(4),
        gas: MIN_GRAM_BALANCE.toFixed(3),
      })
    );
  }

  const chunks: number[][] = [];
  for (let i = 0; i < allMessages.length; i += maxMessages) {
    const end = Math.min(i + maxMessages, allMessages.length);
    const chunk: number[] = [];
    for (let j = i; j < end; j++) chunk.push(j);
    chunks.push(chunk);
  }

  const chunkResults: Record<string, any>[] = [];
  for (let chunkNum = 0; chunkNum < chunks.length; chunkNum++) {
    const chunkMsgIndices = chunks[chunkNum];
    const chunkMessages = chunkMsgIndices.map((i) => allMessages[i]);
    const transactionData = { transaction: { messages: chunkMessages } };

    try {
      const txResult = await executeBatchTransaction(client, transactionData);
      chunkResults.push({
        chunkNum,
        ok: true,
        txResult,
        msgIndices: chunkMsgIndices,
      });

      for (const globalMsgIdx of chunkMsgIndices) {
        const prepEntry = prepared[messageToPreparedIdx[globalMsgIdx]];
        const rId = prepEntry?.reqId;
        if (rId && txResult.boc) {
          const referer = TYPE_CONFIRM_REFERER[prepEntry.item.type] || "stars/buy";
          try {
            await client.confirmRequest(rId, txResult.boc, referer);
          } catch {}
        }
      }
    } catch (exc) {
      chunkResults.push({
        chunkNum,
        ok: false,
        error: String(exc),
        msgIndices: chunkMsgIndices,
      });
    }
  }

  const successfulPrepIndices = new Set<number>();
  for (const cr of chunkResults) {
    for (const mi of cr.msgIndices) {
      if (cr.ok) successfulPrepIndices.add(messageToPreparedIdx[mi]);
    }
  }

  const resultItems: BatchItemResult[] = [];
  for (let finalIdx = 0; finalIdx < prepared.length; finalIdx++) {
    const entry = prepared[finalIdx];
    const item = entry.item;
    const itemType = item.type;
    const username = String(item.username).trim();
    const displayAmount =
      itemType === "premium" ? item.months || 0 : item.amount || 0;

    let owningChunk = -1;
    for (const cr of chunkResults) {
      for (const mi of cr.msgIndices) {
        if (messageToPreparedIdx[mi] === finalIdx) {
          owningChunk = cr.chunkNum;
          break;
        }
      }
      if (owningChunk >= 0) break;
    }

    if (!entry.ok) {
      resultItems.push({
        type: itemType,
        username,
        amount: displayAmount,
        ok: false,
        error: entry.error,
        chunkIndex: Math.max(owningChunk, 0),
      });
    } else if (successfulPrepIndices.has(finalIdx)) {
      let txHash = "";
      for (const cr of chunkResults) {
        if (cr.ok) {
          for (const mi of cr.msgIndices) {
            if (messageToPreparedIdx[mi] === finalIdx) {
              txHash = cr.txResult.txHash;
              break;
            }
          }
        }
        if (txHash) break;
      }
      resultItems.push({
        type: itemType,
        username,
        amount: displayAmount,
        ok: true,
        result: {
          transaction_id: txHash,
          type: itemType,
          username,
          amount: displayAmount,
          payment_method: paymentMethod,
        },
        chunkIndex: Math.max(owningChunk, 0),
      });
    } else {
      let chunkError = "";
      for (const cr of chunkResults) {
        if (!cr.ok) {
          for (const mi of cr.msgIndices) {
            if (messageToPreparedIdx[mi] === finalIdx) {
              chunkError = cr.error || "";
              break;
            }
          }
        }
        if (chunkError) break;
      }
      resultItems.push({
        type: itemType,
        username,
        amount: displayAmount,
        ok: false,
        error: chunkError || "Transaction chunk failed.",
        chunkIndex: Math.max(owningChunk, 0),
      });
    }
  }

  const succeededCount = resultItems.filter((r) => r.ok).length;
  const chunksSentOk = chunkResults.filter((c) => c.ok).length;

  return {
    total: items.length,
    succeeded: succeededCount,
    failed: items.length - succeededCount,
    chunksSent: chunksSentOk,
    items: resultItems,
  };
}

async function executeSingleFlow(
  client: FragmentClient,
  itemType: string,
  username: string,
  amount: number | null | undefined,
  months: number | null | undefined,
  showSender: boolean,
  paymentMethod: string
): Promise<PurchaseResult | EvmPaymentResult> {
  validateSingleItem(itemType, username, amount, months);

  const apiPayment = normalizePaymentMethod(paymentMethod);

  if (!normalizedSet(VALID_PAYMENT_METHODS).has(apiPayment)) {
    throw new ConfigurationError(
      fmt(ConfigurationError.INVALID_PAYMENT_METHOD, {
        method: paymentMethod,
        supported: [...VALID_PAYMENT_METHODS].sort().join(", "),
      })
    );
  }

  if ((itemType === "gram" || itemType === "ton") && apiPayment !== "ton" && apiPayment !== "usdt_ton") {
    throw new ConfigurationError("Ads top-up only supports GRAM/TON payment methods.");
  }

  let isEvm = normalizedSet(EVM_PAYMENT_METHODS).has(apiPayment);
  const isGram = normalizedSet(GRAM_PAYMENT_METHODS).has(apiPayment);

  if (isGram) client.requireWallet();

  try {
    const pageUrl = TYPE_PAGE_MAP[itemType];
    const headers = buildHeaders(pageUrl);
    const cookies = client.cookies;

    const fragmentHash = await fetchFragmentHash(cookies, headers, pageUrl, client.timeout);

    const recipient = await resolveRecipient(
      cookies,
      fragmentHash,
      headers,
      itemType,
      username,
      months,
      client.timeout
    );

    const reqId = await initRequest(
      cookies,
      fragmentHash,
      headers,
      itemType,
      recipient,
      amount,
      months,
      paymentMethod,
      client.timeout
    );

    if (isGram) {
      const account = await buildAccountInfo(client);
      const transaction = await getTransactionLink(
        cookies,
        fragmentHash,
        headers,
        itemType,
        reqId,
        account,
        showSender,
        client.timeout
      );

      if (transaction.evm) {
        isEvm = true;
      } else {
        const txResult = await executeTransaction(client, transaction);

        if (txResult.boc && reqId) {
          try {
            await client.confirmRequest(reqId, txResult.boc, TYPE_CONFIRM_REFERER[itemType]);
          } catch {}
        }

        const displayAmount = itemType === "premium" ? months : amount;
        return {
          transactionId: txResult.txHash,
          type: itemType,
          username,
          amount: displayAmount || 0,
          paymentMethod,
        };
      }
    }

    if (isEvm && TYPE_EVM_PATH[itemType]) {
      const evmKwargs: Record<string, any> = {
        recipient,
        paymentMethod: apiPayment,
      };
      if (itemType === "stars") evmKwargs.quantity = amount;
      else if (itemType === "premium") evmKwargs.months = months;

      const invoice = await fetchEvmInvoice({
        cookies,
        pagePath: TYPE_EVM_PATH[itemType],
        timeout: client.timeout,
        ...evmKwargs,
      });
      return {
        itemKind: itemType,
        target: username,
        amount: itemType === "premium" ? (months || 0) : (amount || 0),
        paymentMethod,
        invoice,
      };
    }

    if (isEvm) {
      throw new ConfigurationError(
        fmt(ConfigurationError.UNSUPPORTED_METHOD, { item_type: itemType })
      );
    }

    throw new FragmentAPIError(`Unsupported payment flow for ${itemType}/${paymentMethod}`);
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Execute a single purchase or batch purchase on Fragment.
 *
 * Supports two invocation formats:
 *
 * 1. Batch format (list of dicts or PurchaseItems):
 *    await client.purchase([
 *      { type: "stars", username: "user1", amount: 100 },
 *      { type: "premium", username: "user2", months: 3 },
 *    ], { paymentMethod: "gram" })
 *
 * 2. Single item format:
 *    await client.purchase("stars", { username: "user1", amount: 100 })
 */
export async function purchase(
  client: FragmentClient,
  itemsOrType:
    | Array<Record<string, any> | PurchaseItem>
    | Record<string, any>
    | PurchaseItem
    | string,
  username?: string | null,
  amount?: number | null,
  months?: number | null,
  showSender: boolean = true,
  paymentMethod: string = "gram"
): Promise<PurchaseResult | BatchResult | EvmPaymentResult> {
  if (Array.isArray(itemsOrType)) {
    const parsedItems: Record<string, any>[] = itemsOrType.map((raw) => {
      if (typeof raw === "object" && "type" in raw && "username" in raw) {
        return { ...raw };
      }
      throw new ConfigurationError(`Invalid batch item format: ${typeof raw}`);
    });
    return executeBatchFlow(client, parsedItems, paymentMethod);
  }

  if (typeof itemsOrType === "object" && "type" in itemsOrType && "username" in itemsOrType) {
    const pi = itemsOrType as PurchaseItem;
    return executeSingleFlow(
      client,
      pi.type,
      pi.username,
      pi.amount,
      pi.months,
      pi.showSender !== false,
      paymentMethod
    );
  }

  if (typeof itemsOrType === "object" && !Array.isArray(itemsOrType)) {
    const d = itemsOrType as Record<string, any>;
    return executeSingleFlow(
      client,
      d.type || "",
      d.username || "",
      d.amount,
      d.months,
      d.show_sender !== false,
      paymentMethod
    );
  }

  if (typeof itemsOrType === "string") {
    if (!username) {
      throw new ConfigurationError("Username is required for single purchase invocation.");
    }
    return executeSingleFlow(
      client,
      itemsOrType,
      username,
      amount,
      months,
      showSender,
      paymentMethod
    );
  }

  throw new ConfigurationError(`Unsupported items argument type: ${typeof itemsOrType}`);
}

export async function batchPurchase(
  client: FragmentClient,
  items: Array<Record<string, any> | PurchaseItem>,
  paymentMethod: string = "gram"
): Promise<BatchResult> {
  const result = await purchase(client, items, null, null, null, true, paymentMethod);
  if ("total" in result) return result as BatchResult;
  return { total: 1, succeeded: 1, failed: 0, chunksSent: 1, items: [] };
}

export async function purchaseStars(
  client: FragmentClient,
  username: string,
  amount: number,
  showSender: boolean = true,
  paymentMethod: string = "gram"
): Promise<PurchaseResult | EvmPaymentResult> {
  return purchase(
    client,
    "stars",
    username,
    amount,
    null,
    showSender,
    paymentMethod
  ) as Promise<PurchaseResult | EvmPaymentResult>;
}

export async function purchasePremium(
  client: FragmentClient,
  username: string,
  months: number,
  showSender: boolean = true,
  paymentMethod: string = "gram"
): Promise<PurchaseResult | EvmPaymentResult> {
  return purchase(
    client,
    "premium",
    username,
    null,
    months,
    showSender,
    paymentMethod
  ) as Promise<PurchaseResult | EvmPaymentResult>;
}

export async function topupGram(
  client: FragmentClient,
  username: string,
  amount: number,
  showSender: boolean = true
): Promise<PurchaseResult> {
  return purchase(
    client,
    "gram",
    username,
    amount,
    null,
    showSender,
    "gram"
  ) as Promise<PurchaseResult>;
}

export async function topupTon(
  client: FragmentClient,
  username: string,
  amount: number,
  showSender: boolean = true
): Promise<PurchaseResult> {
  return topupGram(client, username, amount, showSender);
}