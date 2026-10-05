import { inspect } from "node:util";
import {
  AlreadySubscribedError, AnonymousNumberError, BroadcastUncertainError,
  ConfigurationError, CookieError, FragmentAPIError, ParseError,
  TransactionError, UserNotFoundError,
} from "./exceptions";
import * as C from "./types/constants";
import type * as M from "./types/results";
import type { SessionStorage } from "./storage/base";
import { Mutex, sleep } from "./utils/async";
import {
  authenticate, authTonProof, type AuthenticateOptions,
} from "./utils/auth";
import { fetchEvmInvoice } from "./utils/evm";
import * as H from "./utils/html";
import {
  FragmentTransport, HttpSession, parseProxy, raiseApiError, validatePageUrl,
} from "./utils/http";
import * as V from "./utils/validation";
import {
  deriveAccount, prepareTransaction, validateSenderAccount,
  WalletRuntime, type WalletAdapter,
} from "./utils/wallet";

export interface FragmentClientOptions {
  cookies?: M.Cookies | string | null;
  seed?: string | null;
  apiKey?: string | null;
  apiProvider?: string;
  walletVersion?: string;
  timeout?: number;
  proxy?: string | null;
  sessionStorage?: SessionStorage | null;
  sessionId?: string | null;
  autoRefreshCookies?: boolean;
  sharedAuthSeed?: string | null;
  senderAccount?: M.SenderAccount | null;
  gasReserveNanoton?: bigint | string;
  confirmationTimeout?: number;
  walletAuth?: boolean;
  walletAdapter?: WalletAdapter;
}

type FlowKind =
  "stars" | "premium" | "ton" | "giveaway_stars" |
  "giveaway_premium" | "ads_recharge" | "gateway";

interface FlowDefinition {
  page: string;
  search: string | null;
  state: string;
  init: string;
  link: string;
}

const FLOWS: Record<FlowKind, FlowDefinition> = {
  stars: {
    page: C.STARS_BUY_PAGE, search: "searchStarsRecipient",
    state: "updateStarsBuyState", init: "initBuyStarsRequest", link: "getBuyStarsLink",
  },
  premium: {
    page: C.PREMIUM_GIFT_PAGE, search: "searchPremiumGiftRecipient",
    state: "updatePremiumState", init: "initGiftPremiumRequest", link: "getGiftPremiumLink",
  },
  ton: {
    page: C.ADS_TOPUP_PAGE, search: "searchAdsTopupRecipient",
    state: "updateAdsTopupState", init: "initAdsTopupRequest", link: "getAdsTopupLink",
  },
  giveaway_stars: {
    page: C.STARS_GIVEAWAY_PAGE, search: "searchStarsGiveawayRecipient",
    state: "updateStarsGiveawayState",
    init: "initGiveawayStarsRequest", link: "getGiveawayStarsLink",
  },
  giveaway_premium: {
    page: C.PREMIUM_GIVEAWAY_PAGE, search: "searchPremiumGiveawayRecipient",
    state: "updatePremiumGiveawayState",
    init: "initGiveawayPremiumRequest", link: "getGiveawayPremiumLink",
  },
  ads_recharge: {
    page: C.ADS_PAY_PAGE, search: null, state: "updateAdsState",
    init: "initAdsRechargeRequest", link: "getAdsRechargeLink",
  },
  gateway: {
    page: C.GATEWAY_PAGE, search: null, state: "updateGatewayState",
    init: "initGatewayRechargeRequest", link: "getGatewayRechargeLink",
  },
};

interface ExecutedFlow {
  receipt: M.TransactionResult;
  reqId: string;
}

export class FragmentClient {
  readonly timeout: number;
  readonly confirmationTimeout: number;
  readonly apiProvider: M.ApiProvider;
  readonly walletVersion: M.WalletVersion;
  readonly proxy: string | null;
  readonly gasReserveNanoton: bigint;
  readonly walletAuth: boolean;
  readonly sessionStorage: SessionStorage | null;

  #cookies: M.Cookies;
  #seed: string | null;
  #apiKey: string | null;
  #sharedAuthSeed: string;
  #senderAccount: M.SenderAccount | null;
  #adapter?: WalletAdapter;
  #sessionId: string | null;
  #autoRefresh: boolean;
  #session: HttpSession | null = null;
  #transport: FragmentTransport | null = null;
  #runtime: WalletRuntime | null = null;
  #initialization: Promise<void> | null = null;
  #authenticated = false;
  #closed = false;
  #closing: Promise<void> | null = null;
  #authLock = new Mutex();
  #flowLock = new Mutex();

  /*
   * Configure authentication capabilities independently from payment execution.
   *
   * Missing cookies select restricted wallet authentication. A payer seed and
   * API key enable automatic TON submission; otherwise invoice operations
   * return preparations when a sender identity can be constructed.
   * Secrets use JavaScript private fields and are omitted from diagnostics.
   */
  constructor(options: FragmentClientOptions = {}) {
    this.timeout = V.positiveTimeout(options.timeout ?? C.DEFAULT_TIMEOUT);
    this.confirmationTimeout = V.positiveTimeout(
      options.confirmationTimeout ?? C.CONFIRMATION_TIMEOUT
    );
    this.apiProvider = V.normalizeProvider(options.apiProvider ?? "tonapi");
    this.walletVersion = V.normalizeWalletVersion(options.walletVersion ?? "V5R1");
    this.proxy = options.proxy ? parseProxy(options.proxy) : null;
    this.#seed = options.seed == null ? null : V.normalizeSeed(options.seed);
    this.#apiKey = options.apiKey?.trim() || null;
    this.#sharedAuthSeed = options.sharedAuthSeed ?? C.SHARED_AUTH_SEED;
    this.#cookies = options.cookies == null || options.cookies === ""
      ? {} : V.parseCookies(options.cookies);
    this.walletAuth = options.walletAuth === undefined
      ? !Object.keys(this.#cookies).length
      : V.boolean(options.walletAuth, "walletAuth");
    if (!this.walletAuth) V.validateCookieKeys(this.#cookies, C.REQUIRED_COOKIE_KEYS);
    this.#senderAccount = options.senderAccount
      ? validateSenderAccount(options.senderAccount) : null;
    this.#adapter = options.walletAdapter;
    this.gasReserveNanoton = V.decimalUnits(
      options.gasReserveNanoton ?? C.GAS_RESERVE_NANOTON, 0
    );
    this.sessionStorage = options.sessionStorage ?? null;
    this.#sessionId = options.sessionId ?? null;
    this.#autoRefresh = V.boolean(options.autoRefreshCookies ?? false, "autoRefreshCookies");
    this.#authenticated = this.walletAuth ? this.hasTonToken : this.hasCookies;
  }

  get cookies(): M.Cookies { return { ...this.#cookies }; }
  get hasCookies(): boolean { return Object.keys(this.#cookies).length > 0; }
  get hasWallet(): boolean { return this.#seed !== null && this.#apiKey !== null; }
  get hasTonToken(): boolean { return Boolean(this.#cookies.stel_ton_token?.trim()); }
  get nokycMode(): boolean { return this.walletAuth; }

  toJSON(): M.ApiObject {
    return {
      walletVersion: this.walletVersion,
      walletAuth: this.walletAuth,
      autoPay: this.hasWallet,
      closed: this.#closed,
    };
  }

  [inspect.custom](): M.ApiObject { return this.toJSON(); }

  requireCookies(): M.Cookies {
    if (!this.hasCookies) throw new ConfigurationError("Fragment cookies are required.");
    return this.cookies;
  }

  requireWallet(): void {
    if (!this.#seed || !this.#apiKey) {
      throw new ConfigurationError("Automatic payment requires seed and API key.");
    }
  }

  requireTonToken(): void {
    if (!this.hasTonToken) throw new ConfigurationError("stel_ton_token is required.");
  }

  private requireAccount(operation: string): void {
    if (this.walletAuth) {
      throw new ConfigurationError(`${operation} is unavailable in walletAuth mode.`);
    }
    this.requireCookies();
  }

  private async transport(): Promise<FragmentTransport> {
    if (this.#closed) throw new ConfigurationError("FragmentClient is closed.");
    if (!this.#session) {
      this.#session = new HttpSession([C.FRAGMENT_BASE_URL], this.timeout, this.proxy);
      this.#transport = new FragmentTransport(this.#session);
      this.#initialization = this.#session.importCookies(this.#cookies);
    }
    await this.#initialization;
    return this.#transport!;
  }

  private async syncCookies(): Promise<void> {
    if (this.#session) this.#cookies = await this.#session.exportCookies();
  }

  private async ensureAuth(): Promise<void> {
    const transport = await this.transport();
    if (!this.walletAuth || this.#authenticated) return;
    await this.#authLock.run(async () => {
      if (this.#authenticated) return;
      this.#cookies = await authTonProof(transport, this.#sharedAuthSeed, "V5R1");
      this.#authenticated = true;
    });
  }

  private async saveCookies(): Promise<void> {
    if (this.walletAuth) return;
    await this.syncCookies();
    if (this.sessionStorage && this.#sessionId && this.hasCookies) {
      await this.sessionStorage.save(this.#sessionId, this.#cookies, { mode: "cookies" });
    }
  }

  /*
   * Persist user-owned cookies and release client-owned network resources.
   *
   * Cleanup is idempotent and still executes when persistence fails.
   * Applications should finish their operations before closing the client.
   * Independently supplied Redis storage remains owned by the application.
   */
  async close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    this.#closing = (async () => {
      try { await this.saveCookies(); }
      finally {
        await Promise.all([
          this.#session?.close(),
          this.#runtime?.close(),
        ]);
      }
    })();
    return this.#closing;
  }

  async aclose(): Promise<void> { await this.close(); }

  static async authenticate(options: AuthenticateOptions): Promise<M.Cookies> {
    return authenticate(options);
  }

  static async fromStorage(
    options: FragmentClientOptions & {
      sessionStorage: SessionStorage;
      sessionId: string;
    }
  ): Promise<FragmentClient> {
    let cookies = await options.sessionStorage.load(options.sessionId);
    if (!cookies || !Object.keys(cookies).length) {
      if (!options.seed) throw new CookieError("Stored session was not found.");
      cookies = await authenticate({
        seed: options.seed,
        walletVersion: options.walletVersion,
        walletAdapter: options.walletAdapter,
        timeout: options.timeout,
        proxy: options.proxy,
      });
      await options.sessionStorage.save(options.sessionId, cookies, { mode: "cookies" });
    }
    return new FragmentClient({ ...options, cookies, walletAuth: false });
  }

  async refreshCookies(): Promise<M.Cookies> {
    const transport = await this.transport();
    return this.#authLock.run(async () => {
      const seed = this.walletAuth ? this.#sharedAuthSeed : this.#seed;
      if (!seed) throw new ConfigurationError("Wallet proof refresh requires a seed.");
      this.#cookies = await authTonProof(
        transport, seed,
        this.walletAuth ? "V5R1" : this.walletVersion,
        this.walletAuth ? undefined : this.#adapter
      );
      if (!this.walletAuth) V.validateCookieKeys(this.#cookies, C.REQUIRED_COOKIE_KEYS);
      this.#authenticated = true;
      await this.saveCookies();
      return this.cookies;
    });
  }

  /*
   * Call a raw Fragment method while enforcing local capability restrictions.
   *
   * Restricted sessions cannot override the method through data.method or
   * access private account paths. Recognized expired-session responses permit
   * one proof refresh when enabled; arbitrary transport failures are not replayed.
   */
  async call(
    method: string,
    data: M.ApiObject | null = null,
    pageUrl = C.FRAGMENT_BASE_URL,
    signal?: AbortSignal
  ): Promise<M.ApiObject> {
    V.requiredString(method, "API method");
    const url = new URL(validatePageUrl(pageUrl));
    if (this.walletAuth && (
      !C.WALLET_AUTH_ALLOWED_METHODS.has(method) ||
      url.pathname.startsWith("/my/") || url.pathname.includes("/withdraw")
    )) throw new ConfigurationError(`${method} is unavailable in walletAuth mode.`);
    await this.ensureAuth();
    const transport = await this.transport();
    let result: M.ApiObject;
    try {
      result = await transport.call(method, data ?? {}, url.href, signal);
      const error = V.text(result.error).trim().toLowerCase();
      if (this.#autoRefresh && ["session expired", "unauthorized"].includes(error)) {
        signal?.throwIfAborted();
        await this.refreshCookies();
        result = await transport.call(method, data ?? {}, url.href, signal);
      }
    } finally {
      await this.syncCookies();
    }
    return result;
  }

  private async api(
    method: string,
    data: M.ApiObject = {},
    page = C.FRAGMENT_BASE_URL,
    signal?: AbortSignal
  ): Promise<M.ApiObject> {
    const result = await this.call(method, data, page, signal);
    raiseApiError(result);
    return result;
  }

  private async page(url: string, account = false): Promise<M.ApiObject> {
    if (account) this.requireAccount("Account page");
    const path = new URL(validatePageUrl(url)).pathname;
    if (this.walletAuth && (path.startsWith("/my/") || path.includes("/withdraw"))) {
      throw new ConfigurationError("Private pages are unavailable in walletAuth mode.");
    }
    await this.ensureAuth();
    try {
      const result = await (await this.transport()).page(url);
      raiseApiError(result);
      return result;
    } finally {
      await this.syncCookies();
    }
  }

  private async account(): Promise<M.SenderAccount> {
    if (this.#senderAccount) return { ...this.#senderAccount };
    if (this.#seed) return deriveAccount(this.#seed, this.walletVersion, this.#adapter);
    if (this.walletAuth) return deriveAccount(this.#sharedAuthSeed, "V5R1");
    throw new ConfigurationError("A seed or senderAccount is required for TON preparation.");
  }

  private runtime(): WalletRuntime {
    this.requireWallet();
    if (this.#closed) throw new ConfigurationError("FragmentClient is closed.");
    return this.#runtime ??= new WalletRuntime({
      seed: this.#seed, apiKey: this.#apiKey,
      apiProvider: this.apiProvider, walletVersion: this.walletVersion,
      timeout: this.timeout, adapter: this.#adapter,
    });
  }

  private async resolve(
    method: string,
    query: string,
    page: string,
    extra: M.ApiObject = {}
  ): Promise<M.RecipientInfo | null> {
    const normalized = V.recipient(query);
    const result = await this.call(method, { ...extra, query: normalized }, page);
    const error = V.text(result.error).toLowerCase();
    if (error.includes("already subscribed")) {
      throw new AlreadySubscribedError("This account already has Telegram Premium.");
    }
    if (error.includes("assigned to a user")) {
      throw new UserNotFoundError("Username is not assigned to a personal user.");
    }
    if (/no telegram (users|channels) found/.test(error)) return null;
    raiseApiError(result);
    if (!V.isObject(result.found) || !result.found.recipient) return null;
    return {
      recipient: V.text(result.found.recipient),
      name: V.text(result.found.name),
      myself: result.found.myself === true,
      photoUrl: /src=["']([^"']+)/.exec(V.text(result.found.photo))?.[1] ?? null,
    };
  }

  async getStarsRecipient(username: string): Promise<M.RecipientInfo | null> {
    return this.resolve("searchStarsRecipient", username, C.STARS_BUY_PAGE, { quantity: "" });
  }

  async getPremiumRecipient(username: string, months = 3): Promise<M.RecipientInfo | null> {
    return this.resolve("searchPremiumGiftRecipient", username, C.PREMIUM_GIFT_PAGE, {
      months: V.months(months),
    });
  }

  async getAdsTopupRecipient(username: string): Promise<M.RecipientInfo | null> {
    return this.resolve("searchAdsTopupRecipient", username, C.ADS_TOPUP_PAGE);
  }

  async getGiveawayStarsRecipient(
    channel: string, winners = 1, amount = 500
  ): Promise<M.RecipientInfo | null> {
    V.starsGiveaway(amount, winners);
    return this.resolve("searchStarsGiveawayRecipient", channel, C.STARS_GIVEAWAY_PAGE, {
      quantity: winners, stars: amount,
    });
  }

  async getGiveawayPremiumRecipient(
    channel: string, winners = 1, months = 3
  ): Promise<M.RecipientInfo | null> {
    V.integer(winners, 1, 24000);
    V.months(months);
    return this.resolve("searchPremiumGiveawayRecipient", channel, C.PREMIUM_GIVEAWAY_PAGE, {
      quantity: winners, months,
    });
  }

  /*
   * Report a signed external message and observe Fragment's completion signal.
   *
   * Broadcast acceptance is not fulfillment. Polling only marks confirmed when
   * the state reports mode=done and need_update=false without an application
   * error. Confirmation failures remain attached to the original receipt.
   */
  private async confirm(
    transaction: M.ApiObject,
    receipt: M.TransactionResult,
    account: M.SenderAccount,
    reqId: string,
    page: string,
    stateMethod: string | null
  ): Promise<M.TransactionResult> {
    if (!receipt.boc) {
      receipt.confirmationError = "Signed external BOC is unavailable.";
      return receipt;
    }
    try {
      const parameters = transaction.confirm_params == null
        ? { id: reqId } : V.object(transaction.confirm_params);
      await this.api(V.text(transaction.confirm_method, "confirmReq"), {
        ...parameters,
        account: JSON.stringify(account),
        device: C.DEVICE_FINGERPRINT,
        boc: receipt.boc,
      }, page);
      if (!stateMethod) return receipt;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.confirmationTimeout);
      let mode = "new";
      try {
        while (true) {
          const response = await this.api(stateMethod, {
            mode, lv: "false", dh: process.hrtime.bigint().toString(),
          }, page, controller.signal);
          mode = V.text(response.mode, mode);
          if (mode === "done" && response.need_update === false) {
            receipt.confirmed = true;
            receipt.status = "confirmed";
            return receipt;
          }
          await sleep(C.CONFIRMATION_INTERVAL, controller.signal);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      receipt.confirmationError =
        "Fragment fulfillment was not established. Reconcile the original request.";
      return receipt;
    }
  }

  /*
   * Run one session-scoped invoice flow from initialization to optional payment.
   *
   * The flow lock prevents concurrent invoice state from overlapping inside
   * this client. Every invoice retains its own message list, request identity,
   * fee accounting, sender, and fulfillment result.
   * EVM invoices remain external and never enter the TON signing runtime.
   */
  private async purchaseFlow(
    kind: FlowKind,
    target: string,
    amount: number,
    paymentMethod = "ton",
    showSender = true,
    winners?: number
  ): Promise<ExecutedFlow | M.PreparedTransaction | M.EvmPaymentResult> {
    const method = V.normalizePaymentMethod(paymentMethod);
    V.boolean(showSender, "showSender");
    if (["ton", "ads_recharge", "gateway"].includes(kind) && method !== "ton") {
      throw new ConfigurationError("This operation supports native TON only.");
    }
    const flow = FLOWS[kind];
    return this.#flowLock.run(async () => {
      const account = C.EVM_PAYMENT_METHODS.has(method) ? null : await this.account();
      await this.api(flow.state, {
        mode: "new", lv: "false", dh: process.hrtime.bigint().toString(),
      }, flow.page);
      const extra: M.ApiObject = {};
      if (kind === "stars") extra.quantity = "";
      if (kind === "premium" || kind === "giveaway_premium") extra.months = amount;
      if (winners !== undefined) extra.quantity = winners;
      if (kind === "giveaway_stars") extra.stars = amount;
      const resolved = flow.search
        ? await this.resolve(flow.search, target, flow.page, extra) : null;
      if (flow.search && !resolved) throw new UserNotFoundError("Recipient was not found.");
      const data: M.ApiObject = resolved
        ? { recipient: resolved.recipient } : { account: target };
      if (kind === "stars") data.quantity = amount;
      else if (kind === "premium") data.months = amount;
      else if (kind === "giveaway_stars") {
        Object.assign(data, { quantity: winners, stars: amount });
        await this.api("updateStarsGiveawayPrices", {
          quantity: winners, stars: amount,
        }, flow.page);
      } else if (kind === "giveaway_premium") {
        Object.assign(data, { quantity: winners, months: amount });
        await this.api("updatePremiumGiveawayPrices", { quantity: winners }, flow.page);
      } else if (kind === "gateway") data.credits = amount;
      else data.amount = amount;
      if (!["ton", "ads_recharge", "gateway"].includes(kind)) data.payment_method = method;
      const initialized = await this.api(flow.init, data, flow.page);
      const reqId = V.text(initialized.req_id);
      if (!reqId) throw new FragmentAPIError("Fragment returned no request ID.");

      if (C.EVM_PAYMENT_METHODS.has(method)) {
        const invoice = await fetchEvmInvoice(await this.transport(), {
          pagePath: new URL(flow.page).pathname,
          recipient: resolved?.recipient ?? target,
          paymentMethod: method,
          quantity: kind === "stars" ? amount : kind === "giveaway_stars" ? winners : undefined,
          months: ["premium", "giveaway_premium"].includes(kind) ? amount : undefined,
          amount: kind === "giveaway_stars" ? amount : undefined,
          winners: kind === "giveaway_premium" ? winners : undefined,
        });
        return { status: "invoice", itemKind: kind, target, amount, paymentMethod: method, invoice };
      }

      const transaction = await this.api(flow.link, {
        account: JSON.stringify(account),
        device: C.DEVICE_FINGERPRINT,
        transaction: 1, id: reqId, show_sender: Number(showSender),
      }, flow.page);
      if (transaction.evm) throw new TransactionError("Fragment changed TON payment to EVM.");
      const quote = initialized.amount ??
        (kind === "ton" || kind === "ads_recharge" ? amount : null);
      const principal = method === "ton" && quote !== null
        ? V.decimalUnits(quote, 9) : null;
      const usdt = method === "usdt_ton" ? V.decimalUnits(initialized.amount, 6) : null;
      const prepared = prepareTransaction(transaction, {
        paymentMethod: method, paymentNanoton: principal,
        walletVersion: this.walletVersion,
        itemKind: kind, target, amount, reqId,
        senderAddress: account!.address,
        confirmReferer: new URL(flow.page).pathname.replace(/^\/+/, ""),
        gasReserveNanoton: this.gasReserveNanoton,
        requiredUsdtUnits: usdt,
      });
      if (!this.hasWallet) return prepared;
      if (!this.walletAuth) this.requireTonToken();
      const receipt = await this.runtime().execute(prepared);
      await this.confirm(transaction, receipt, account!, reqId, flow.page, flow.state);
      return { receipt, reqId };
    });
  }

  private receipt(result: ExecutedFlow): M.PaymentReceipt {
    return {
      transactionId: result.receipt.txHash,
      confirmed: result.receipt.confirmed,
      feeNanoton: result.receipt.feeNanoton,
      reqId: result.reqId || null,
      confirmationError: result.receipt.confirmationError,
    };
  }

  private async single(
    kind: "stars" | "premium" | "ton",
    username: string,
    amount: number,
    showSender: boolean,
    paymentMethod: string
  ): Promise<M.PurchaseOutcome> {
    const target = V.recipient(username);
    const result = await this.purchaseFlow(kind, target, amount, paymentMethod, showSender);
    if (!("receipt" in result)) return result;
    return {
      ...this.receipt(result),
      type: kind, username: target, amount,
      paymentMethod: V.normalizePaymentMethod(paymentMethod),
    };
  }

  async purchaseStars(
    username: string, amount: number, showSender = true, paymentMethod = "gram"
  ): Promise<M.PurchaseOutcome> {
    V.integer(amount, 50, 10_000_000, "Stars amount must be between 50 and 10000000.");
    return this.single("stars", username, amount, showSender, paymentMethod);
  }

  async purchasePremium(
    username: string, months: number, showSender = true, paymentMethod = "gram"
  ): Promise<M.PurchaseOutcome> {
    V.months(months);
    return this.single("premium", username, months, showSender, paymentMethod);
  }

  async topupGram(
    username: string, amount: number, showSender = true
  ): Promise<M.PurchaseResult | M.PreparedTransaction> {
    V.integer(amount, 1, 1_000_000_000);
    const result = await this.single("ton", username, amount, showSender, "ton");
    if ("invoice" in result) throw new TransactionError("Unexpected EVM invoice.");
    return result;
  }

  async topupTon(
    username: string, amount: number, showSender = true
  ): Promise<M.PurchaseResult | M.PreparedTransaction> {
    return this.topupGram(username, amount, showSender);
  }

  async purchase(
    input: string | M.PurchaseItem | M.PurchaseItem[],
    username?: string | null,
    amount?: number | null,
    months?: number | null,
    showSender = true,
    paymentMethod = "gram"
  ): Promise<M.PurchaseOutcome | M.BatchResult> {
    if (Array.isArray(input)) return this.batchPurchase(input, paymentMethod);
    const item = typeof input === "string"
      ? { type: input, username, amount, months, showSender }
      : V.object(input, "Purchase item");
    const sender = item.showSender ?? item.show_sender ?? true;
    V.boolean(sender, "showSender");
    const target = V.recipient(item.username);
    if (item.type === "stars") {
      return this.purchaseStars(target, item.amount as number, sender as boolean, paymentMethod);
    }
    if (item.type === "premium") {
      return this.purchasePremium(target, item.months as number, sender as boolean, paymentMethod);
    }
    if (item.type === "ton" || item.type === "gram") {
      if (V.normalizePaymentMethod(paymentMethod) !== "ton") {
        throw new ConfigurationError("Ads top-up requires native TON.");
      }
      return this.topupTon(target, item.amount as number, sender as boolean);
    }
    throw new ConfigurationError("Unsupported purchase type.");
  }

  /*
   * Process an ordered batch without splitting or merging invoice messages.
   *
   * Prepared items count as accepted outcomes, not fulfilled services.
   * Broadcast uncertainty stops the remaining items. Other item-level failures
   * are recorded independently, and no failed payment is automatically replayed.
   */
  async batchPurchase(
    items: M.PurchaseItem[],
    paymentMethod = "gram"
  ): Promise<M.BatchResult> {
    const method = V.normalizePaymentMethod(paymentMethod);
    if (method !== "ton" && method !== "usdt_ton") {
      throw new ConfigurationError("Batches support TON and USDT-TON.");
    }
    if (!Array.isArray(items)) throw new ConfigurationError("Batch must be an array.");
    const results: M.BatchItemResult[] = [];
    const preparedTransactions: M.PreparedTransaction[] = [];
    let chunksSent = 0;
    let stopped = false;
    for (let index = 0; index < items.length; index++) {
      const raw = items[index];
      const item: any = V.isObject(raw) ? raw : {};
      const value = item.type === "premium" ? item.months : item.amount;
      const entry: M.BatchItemResult = {
        type: V.text(item.type), username: V.text(item.username),
        amount: typeof value === "number" && Number.isSafeInteger(value) ? value : 0,
        ok: false, result: null, error: null, chunkIndex: index, status: "failed",
      };
      if (stopped) {
        entry.error = "Not attempted after an unresolved broadcast.";
        results.push(entry);
        continue;
      }
      try {
        const result = await this.purchase(raw, null, null, null, true, method);
        if ("total" in result || "invoice" in result) {
          throw new TransactionError("Unexpected batch item result.");
        }
        entry.result = result;
        entry.ok = true;
        if ("messages" in result) {
          entry.status = "prepared";
          preparedTransactions.push(result);
        } else {
          chunksSent++;
          entry.status = result.confirmed ? "confirmed" : "broadcast";
        }
      } catch (error) {
        entry.error = error instanceof Error ? error.message : "Operation failed.";
        if (error instanceof BroadcastUncertainError) {
          entry.status = "unknown";
          stopped = true;
        }
      }
      results.push(entry);
    }
    const succeeded = results.filter(item => item.ok).length;
    return {
      total: items.length, succeeded, failed: items.length - succeeded,
      chunksSent, items: results, preparedTransactions,
    };
  }

  async giveawayStars(
    channel: string, winners: number, amount: number, paymentMethod = "gram"
  ): Promise<M.GiveawayOutcome> {
    V.starsGiveaway(amount, winners);
    return this.giveaway("giveaway_stars", channel, winners, amount, paymentMethod);
  }

  async giveawayPremium(
    channel: string, winners: number, months = 3, paymentMethod = "gram"
  ): Promise<M.GiveawayOutcome> {
    V.integer(winners, 1, 24000);
    V.months(months);
    return this.giveaway("giveaway_premium", channel, winners, months, paymentMethod);
  }

  private async giveaway(
    kind: "giveaway_stars" | "giveaway_premium",
    channel: string, winners: number, amount: number, paymentMethod: string
  ): Promise<M.GiveawayOutcome> {
    const target = V.recipient(channel);
    const result = await this.purchaseFlow(kind, target, amount, paymentMethod, true, winners);
    if (!("receipt" in result)) return result;
    return {
      ...this.receipt(result), channel: target, winners, amount,
      paymentMethod: V.normalizePaymentMethod(paymentMethod),
    };
  }

  async rechargeAds(
    accountId: string, amount: number
  ): Promise<M.AdsRechargeResult | M.PreparedTransaction> {
    V.integer(amount, 1, 1_000_000_000);
    const result = await this.purchaseFlow(
      "ads_recharge", V.requiredString(accountId, "Account ID"), amount
    );
    if ("invoice" in result) throw new TransactionError("Unexpected EVM invoice.");
    if (!("receipt" in result)) return result;
    return { ...this.receipt(result), accountId, amount };
  }

  async rechargeGateway(
    accountId: string, credits: number
  ): Promise<M.GatewayRechargeResult | M.PreparedTransaction> {
    V.integer(credits, 1, 1_000_000_000_000);
    const result = await this.purchaseFlow(
      "gateway", V.requiredString(accountId, "Account ID"), credits
    );
    if ("invoice" in result) throw new TransactionError("Unexpected EVM invoice.");
    if (!("receipt" in result)) return result;
    return { ...this.receipt(result), accountId, credits };
  }

  async getGatewayPrice(accountId: string, credits: number): Promise<M.GatewayPriceInfo> {
    V.integer(credits, 1, 1_000_000_000_000);
    const result = await this.api("updateGatewayPrices", {
      account: V.requiredString(accountId, "Account ID"), credits,
    }, C.GATEWAY_PAGE);
    if (result.price == null) throw new ParseError("Gateway quote has no price.");
    return { credits, gramPrice: V.text(result.price), usdPrice: V.nullableText(result.usd_price) };
  }

  async getWallet(): Promise<M.WalletInfo> { return this.runtime().info(); }

  async getStarsPrice(quantity: number): Promise<M.StarsPrice> {
    V.integer(quantity, 50, 10_000_000);
    const result = await this.api("updateStarsPrices", {
      stars: "0", quantity,
    }, C.STARS_BUY_PAGE);
    const [native, usd] = H.parseStarsPriceFromHtml(V.text(result.cur_price));
    if (native === null) throw new ParseError("Stars quote has no native price.");
    return { stars: quantity, gramPrice: native, tonPrice: native, usdPrice: usd ?? "0" };
  }

  private rate(data: M.ApiObject): M.RateModel {
    const state = V.isObject(data.s) ? data.s : {};
    const value = Number(state.tonRate ?? 0);
    const rate = Number.isFinite(value) ? value : 0;
    return { gramRate: rate, tonRate: rate };
  }

  async getStarsPrices(): Promise<M.StarsPrices> {
    const data = await this.page(C.STARS_BUY_PAGE);
    return { packages: H.parseStarsPackages(V.text(data.h)), ...this.rate(data) };
  }

  async getPremiumPrices(): Promise<M.PremiumPrices> {
    const data = await this.page(C.PREMIUM_GIFT_PAGE);
    return { options: H.parsePremiumOptions(V.text(data.h)), ...this.rate(data) };
  }

  private async search(
    type: string, page: string, query: string,
    sort?: string | null, filter?: string | null, extra: M.ApiObject = {}
  ): Promise<[M.ApiObject, string]> {
    if (sort != null && !["price", "price_desc", "price_asc", "listed", "ending"].includes(sort)) {
      throw new ConfigurationError("Invalid auction sort.");
    }
    if (filter != null && !["", "auction", "sale", "sold"].includes(filter)) {
      throw new ConfigurationError("Invalid auction filter.");
    }
    const result = await this.api("searchAuctions", {
      type, query, sort, filter, ...extra,
    }, page);
    return [result, result.html == null
      ? V.text(result.body) + V.text(result.foot) : V.text(result.html)];
  }

  async searchUsernames(
    query = "", sort?: string | null, filter?: string | null, offsetId?: string | null
  ): Promise<M.UsernamesResult> {
    const [raw, html] = await this.search("usernames", C.FRAGMENT_BASE_URL, query, sort, filter, {
      offset_id: offsetId,
    });
    return {
      items: H.parseAuctionRows(html),
      nextOffsetId: V.nullableText(raw.next_offset_id ?? H.parseListingOffset(html)),
    };
  }

  async searchNumbers(
    query = "", sort?: string | null, filter?: string | null, offsetId?: string | null
  ): Promise<M.NumbersResult> {
    const [raw, html] = await this.search("numbers", C.NUMBERS_PAGE, query, sort, filter, {
      offset_id: offsetId,
    });
    return {
      items: H.parseAuctionRows(html),
      nextOffsetId: V.nullableText(raw.next_offset_id ?? H.parseListingOffset(html)),
    };
  }

  async searchGifts(
    query = "", collection?: string | null, sort?: string | null,
    filter?: string | null, view?: string | null,
    attr?: Record<string, string[] | string> | null, offset?: number | null
  ): Promise<M.GiftsResult> {
    if (offset != null) V.integer(offset, 0, Number.MAX_SAFE_INTEGER);
    const extra: M.ApiObject = { collection, view, offset_id: offset };
    for (const [field, raw] of Object.entries(attr ?? {})) {
      const name = field.replace(/^attr\[/i, "").replace(/]$/, "").trim().toLowerCase();
      const normalized = { model: "Model", backdrop: "Backdrop", symbol: "Symbol" }[
        name as "model" | "backdrop" | "symbol"
      ];
      if (!normalized) throw new ConfigurationError("Invalid gift attribute.");
      let values: unknown = raw;
      if (typeof raw === "string") {
        try { values = JSON.parse(raw); }
        catch { throw new ConfigurationError("Gift attributes must be JSON arrays."); }
      }
      if (!Array.isArray(values) || values.some(value => typeof value !== "string")) {
        throw new ConfigurationError("Gift attributes must be arrays of strings.");
      }
      extra[`attr[${normalized}]`] = JSON.stringify(values);
    }
    const [, html] = await this.search("gifts", C.GIFTS_PAGE, query, sort, filter, extra);
    const [items, nextOffset] = H.parseGiftItems(html);
    return { items, nextOffset };
  }

  async getGiftFilters(collection?: string | null): Promise<M.GiftFiltersInfo> {
    const url = C.GIFTS_PAGE + (collection ? `/${encodeURIComponent(collection)}` : "");
    return H.parseGiftFilters(V.text((await this.page(url)).h));
  }

  private item(itemType: number, input: string): { slug: string; url: string } {
    const prefix = C.ITEM_TYPE_URL_PREFIX[itemType];
    if (!prefix || !Number.isInteger(itemType)) {
      throw new ConfigurationError("Asset type must be 1, 3, or 5.");
    }
    let slug = V.requiredString(input, "Asset slug").replace(/^@+/, "").replace(/^\/+/, "");
    if (slug.startsWith(`${prefix}/`)) slug = slug.slice(prefix.length + 1);
    if (!slug || /[/?#]/.test(slug)) throw new ConfigurationError("Invalid asset slug.");
    return { slug, url: `${C.FRAGMENT_BASE_URL}/${prefix}/${encodeURIComponent(slug)}` };
  }

  private async itemInfo(
    itemType: number, slug: string
  ): Promise<[M.ItemInfo, string, M.ApiObject]> {
    const data = await this.page(this.item(itemType, slug).url);
    const html = V.text(data.h);
    const state = V.isObject(data.s) ? data.s : {};
    const [bidHistory, bidHistoryNextOffset] = H.parseBidHistory(html);
    const [ownerHistory, ownerHistoryNextOffset] = H.parseOwnerHistory(html);
    const [offerHistory, offerHistoryNextOffset] = H.parseOfferHistory(html);
    return [{
      ...this.rate(data), itemType, status: H.parseItemStatus(html),
      auction: H.parseAuctionInfo(html),
      auctionEnd: /class="[^"]*tm-countdown-timer[^"]*"[^>]*datetime="([^"]+)"/.exec(html)?.[1] ?? null,
      purchasedDate: /Purchased on\s*<time[^>]+datetime="([^"]+)"/.exec(html)?.[1] ?? null,
      ownerWallet: H.parseSoldOwner(html),
      bidHistory, ownerHistory, offerHistory,
      bidHistoryNextOffset, ownerHistoryNextOffset, offerHistoryNextOffset,
    }, html, state];
  }

  async getUsernameInfo(username: string): Promise<M.UsernameInfo> {
    const [common, , state] = await this.itemInfo(1, username);
    return { ...common, username: V.text(state.username, this.item(1, username).slug) };
  }

  async getNumberInfo(number: string): Promise<M.NumberInfo> {
    const clean = number.replace(/[+\s-]/g, "");
    const [common, html, state] = await this.itemInfo(3, clean);
    return {
      ...common, number: V.text(state.username, clean),
      displayNumber: V.text(state.itemTitle, `+${clean}`),
      restricted: html.includes("tm-status-restricted"),
    };
  }

  async getGiftInfo(slug: string): Promise<M.GiftInfo> {
    const [common, html, state] = await this.itemInfo(5, slug);
    return {
      ...common, slug: V.text(state.username, this.item(5, slug).slug),
      name: V.text(state.itemTitle, slug),
      imageUrl: /src="(https:\/\/nft\.fragment\.com\/gift\/[^"]+)"/.exec(html)?.[1] ?? null,
      stickerUrl: /srcset="(https:\/\/nft\.fragment\.com\/gift\/[^"]+\.tgs)"/.exec(html)?.[1] ?? null,
      attributes: H.parseGiftAttributes(html), issued: H.parseGiftIssued(html),
    };
  }

  private async historyPage<T>(
    page: string, parser: (html: string) => T, query: Record<string, string>
  ): Promise<T> {
    return parser(V.text((await this.page(`${page}?${new URLSearchParams(query)}`, true)).h));
  }

  async getStarsHistory(sort = "desc"): Promise<M.StarsTransaction[]> {
    return this.historyPage(C.STARS_HISTORY_PAGE, H.parseStarsHistory, { sort });
  }

  async getPremiumHistory(sort = "desc"): Promise<M.PremiumTransaction[]> {
    return this.historyPage(C.PREMIUM_HISTORY_PAGE, H.parsePremiumHistory, { sort });
  }

  async getTopupHistory(sort = "asc"): Promise<M.TopupTransaction[]> {
    return this.historyPage(C.ADS_HISTORY_PAGE, H.parseTopupHistory, { type: "topup", sort });
  }

  async getProfile(): Promise<M.ProfileInfo> {
    const result = await this.page(C.PROFILE_PAGE, true);
    return H.parseProfile(V.text(result.h) + V.text(result.j));
  }

  async getSessions(): Promise<M.SessionInfo[]> {
    return H.parseSessions(V.text((await this.page(C.SESSIONS_PAGE, true)).h));
  }

  async listSessions(): Promise<M.SessionInfo[]> { return this.getSessions(); }

  async terminateSession(sessionId: string): Promise<boolean> {
    this.requireAccount("terminateSession");
    return (await this.api("tonTerminateSession", {
      session_id: V.requiredString(sessionId, "Session ID"),
    }, C.SESSIONS_PAGE)).ok === true;
  }

  async getMyBids(itemType = "usernames", sort = "desc"): Promise<M.MyBidsResult> {
    this.requireAccount("getMyBids");
    if (!["usernames", "numbers", "gifts"].includes(itemType)) {
      throw new ConfigurationError("Invalid asset category.");
    }
    const data = await this.page(
      `${C.MY_BIDS_PAGE}?${new URLSearchParams({ type: itemType, sort })}`, true
    );
    const [items, totalCount] = H.parseMyBids(V.text(data.h), itemType);
    return { items, totalCount, ...this.rate(data) };
  }

  async getMyAssets(itemType = "usernames"): Promise<M.MyAssetsResult> {
    this.requireAccount("getMyAssets");
    const pages: Record<string, string> = {
      usernames: C.MY_USERNAMES_PAGE, numbers: C.MY_NUMBERS_PAGE, gifts: C.MY_GIFTS_PAGE,
    };
    if (!Object.hasOwn(pages, itemType)) throw new ConfigurationError("Invalid asset category.");
    const data = await this.page(pages[itemType], true);
    const [items, totalCount] = H.parseMyAssets(V.text(data.h), itemType);
    return { items, totalCount, ...this.rate(data) };
  }

  private async orders(
    method: string, itemType: number, input: string, offsetId: string
  ): Promise<M.ApiObject> {
    const { slug, url } = this.item(itemType, input);
    return this.api(method, { type: itemType, username: slug, offset_id: offsetId }, url);
  }

  async getOrdersHistory(type: number, slug: string, offset: string): Promise<M.ApiObject> {
    return this.orders("getOrdersHistory", type, slug, offset);
  }

  async getOwnersHistory(type: number, slug: string, offset: string): Promise<M.ApiObject> {
    return this.orders("getOwnersHistory", type, slug, offset);
  }

  async getOffersHistory(type: number, slug: string, offset: string): Promise<M.ApiObject> {
    return this.orders("getOffersHistory", type, slug, offset);
  }

  /*
   * Execute a user-owned account transaction with an explicit native principal.
   *
   * Zero principal is reserved for administrative gas-only operations.
   * Account operations require full cookies, a connected wallet token, and
   * automatic payer credentials. Their receipts do not run invoice polling.
   */
  private async accountTransaction(
    method: string, data: M.ApiObject, page: string, principal = 0n
  ): Promise<[ExecutedFlow, M.ApiObject]> {
    this.requireAccount(method);
    this.requireTonToken();
    this.requireWallet();
    const account = await this.account();
    const transaction = await this.api(method, {
      ...data, account: JSON.stringify(account),
      device: C.DEVICE_FINGERPRINT, transaction: 1,
    }, page);
    const parameters = V.isObject(transaction.confirm_params) ? transaction.confirm_params : {};
    const reqId = V.text(parameters.id);
    const prepared = prepareTransaction(transaction, {
      paymentMethod: "ton", paymentNanoton: principal,
      walletVersion: this.walletVersion,
      itemKind: "operation", target: "", amount: 0, reqId,
      senderAddress: account.address,
      gasReserveNanoton: this.gasReserveNanoton,
    });
    const receipt = await this.runtime().execute(prepared);
    if (transaction.confirm_method) {
      await this.confirm(transaction, receipt, account, reqId, page, null);
    }
    return [{ receipt, reqId }, transaction];
  }

  async placeBid(itemType: number, input: string, bid: number): Promise<M.BidResult> {
    this.requireAccount("placeBid");
    V.integer(bid, 1, 1_000_000_000_000);
    const { slug, url } = this.item(itemType, input);
    const [result, transaction] = await this.accountTransaction("getBidLink", {
      type: itemType, username: slug, bid,
    }, url, BigInt(bid) * C.NANO_PER_TON);
    const parameters = V.isObject(transaction.confirm_params) ? transaction.confirm_params : {};
    return {
      ...this.receipt(result), itemType, slug, bid,
      confirmMethod: V.nullableText(transaction.confirm_method),
      confirmId: V.nullableText(parameters.id),
    };
  }

  async makeOffer(itemType: number, input: string, amount: number): Promise<M.OfferResult> {
    this.requireAccount("makeOffer");
    V.integer(amount, 1, 1_000_000_000_000);
    const { slug, url } = this.item(itemType, input);
    const initialized = await this.api("initOfferRequest", { type: itemType, username: slug }, url);
    const reqId = V.text(initialized.req_id);
    if (!reqId) throw new FragmentAPIError("Offer request ID is missing.");
    const [result] = await this.accountTransaction("getOfferLink", {
      id: reqId, amount,
    }, url, BigInt(amount) * C.NANO_PER_TON);
    return { ...this.receipt(result), reqId, itemType, slug, amount };
  }

  async cancelAuction(itemType: number, input: string): Promise<M.TransactionResult> {
    const { slug, url } = this.item(itemType, input);
    const [result] = await this.accountTransaction("getCancelAuctionLink", {
      type: itemType, username: slug,
    }, url);
    return result.receipt;
  }

  private async subscribe(
    itemType: number, input: string, subscribed: boolean
  ): Promise<M.SubscriptionResult> {
    this.requireAccount("subscribe");
    const { slug, url } = this.item(itemType, input);
    const result = await this.api(subscribed ? "subscribe" : "unsubscribe", {
      type: itemType, username: slug,
    }, url);
    return { ok: result.ok !== false, subscribed, itemType, slug };
  }

  async subscribeToItem(type: number, slug: string): Promise<M.SubscriptionResult> {
    return this.subscribe(type, slug, true);
  }

  async unsubscribeFromItem(type: number, slug: string): Promise<M.SubscriptionResult> {
    return this.subscribe(type, slug, false);
  }

  async getAssignAccounts(itemType: number, slug: string): Promise<M.AssignAccountsResult> {
    const data = await this.page(this.item(itemType, slug).url, true);
    const [accounts, canDisable] = H.parseAssignAccounts(V.text(data.h));
    return { accounts, canDisable };
  }

  async assignToTelegram(
    itemType: number, input: string, assignTo?: string | null, waitForBotPayment = true
  ): Promise<M.AssignResult> {
    this.requireAccount("assignToTelegram");
    V.boolean(waitForBotPayment, "waitForBotPayment");
    const { slug, url } = this.item(itemType, input);
    const data: M.ApiObject = { type: itemType, username: slug, assign_to: assignTo };
    let result = await this.api("assignToTgAccount", data, url);
    if (result.need_pay && waitForBotPayment && this.hasWallet) {
      const reqId = V.text(result.req_id);
      if (!reqId) throw new FragmentAPIError("Assignment payment request ID is missing.");
      await this.accountTransaction("getBotUsernameLink", {
        id: reqId,
      }, url, V.decimalUnits(result.amount, 9));
      result = await this.api("assignToTgAccount", data, url);
    }
    return {
      ok: result.ok === true || result.need_pay === true,
      message: V.nullableText(result.msg), needPay: result.need_pay === true,
      reqId: V.nullableText(result.req_id), amount: V.nullableText(result.amount),
      assignName: V.nullableText(result.assign_name),
    };
  }

  async startAuction(
    itemType: number, input: string, minAmount: number, maxAmount = 0
  ): Promise<M.StartAuctionResult> {
    this.requireAccount("startAuction");
    V.integer(minAmount, 1, 1_000_000_000_000);
    V.integer(maxAmount, 0, 1_000_000_000_000);
    if (maxAmount && maxAmount < minAmount) {
      throw new ConfigurationError("Maximum price must not be below minimum price.");
    }
    const { slug, url } = this.item(itemType, input);
    const allowed = await this.api("canSellItem", {
      type: itemType, username: slug, auction: maxAmount ? "false" : "true",
    }, url);
    if (!allowed.ok) return { ok: false, reqId: null, transactionId: null, confirmed: false };
    const [result] = await this.accountTransaction("getStartAuctionLink", {
      type: itemType, username: slug, min_amount: minAmount, max_amount: maxAmount,
    }, url);
    return {
      ok: true, reqId: result.reqId || null,
      transactionId: result.receipt.txHash, confirmed: result.receipt.confirmed,
    };
  }

  async sellAsset(type: number, slug: string, price: number): Promise<M.StartAuctionResult> {
    return this.startAuction(type, slug, price, price);
  }

  async searchNftTransferRecipient(query: string): Promise<M.NftTransferRecipient | null> {
    this.requireAccount("searchNftTransferRecipient");
    return this.resolve("searchNftTransferRecipient", query, C.FRAGMENT_BASE_URL);
  }

  async initNftTransfer(input: string, recipient: string): Promise<M.NftTransferRequest> {
    this.requireAccount("initNftTransfer");
    const { slug, url } = this.item(5, input);
    const result = await this.api("initNftTransferRequest", { slug, recipient }, `${url}/transfer`);
    const reqId = V.text(result.req_id);
    if (!reqId) throw new FragmentAPIError("NFT transfer request ID is missing.");
    return {
      reqId, myself: result.myself === true, itemTitle: V.text(result.item_title),
      content: V.text(result.content), button: V.text(result.button),
    };
  }

  async transferNft(reqId: string, showSender = true): Promise<M.TransactionResult> {
    V.boolean(showSender, "showSender");
    const [result] = await this.accountTransaction("getNftTransferLink", {
      id: reqId, show_sender: Number(showSender),
    }, C.FRAGMENT_BASE_URL);
    return result.receipt;
  }

  async getLoginCode(number: string): Promise<M.LoginCodeResult> {
    this.requireAccount("getLoginCode");
    const result = await this.api("updateLoginCodes", {
      number: number.replace(/^\+/, ""), lt: "0", from_app: "1",
    }, C.NUMBERS_PAGE);
    const [code, activeSessions] = H.parseLoginCode(V.text(result.html));
    const value: M.LoginCodeResult = { number, code, activeSessions };
    Object.defineProperty(value, inspect.custom, {
      value: () => ({ number, activeSessions, code: "[REDACTED]" }),
      enumerable: false,
    });
    return value;
  }

  async toggleLoginCodes(number: string, canReceive: boolean): Promise<void> {
    this.requireAccount("toggleLoginCodes");
    V.boolean(canReceive, "canReceive");
    await this.api("toggleLoginCodes", {
      number: number.replace(/^\+/, ""), can_receive: Number(canReceive),
    }, C.NUMBERS_PAGE);
  }

  async terminateSessions(number: string): Promise<M.TerminateSessionsResult> {
    this.requireAccount("terminateSessions");
    const data = { number: number.replace(/^\+/, "") };
    const first = await this.api("terminatePhoneSessions", data, C.NUMBERS_PAGE);
    if (!first.terminate_hash) throw new AnonymousNumberError("No termination challenge is available.");
    const result = await this.api("terminatePhoneSessions", {
      ...data, terminate_hash: first.terminate_hash,
    }, C.NUMBERS_PAGE);
    return { number, message: V.nullableText(result.msg) };
  }

  async getNftWithdrawalState(transaction: string): Promise<M.ApiObject> {
    return this.page(
      `${C.NFT_WITHDRAW_PAGE}?${new URLSearchParams({ transaction })}`, true
    );
  }

  async getStarsWithdrawalState(transaction: string): Promise<M.StarsWithdrawalState> {
    const data = await this.page(
      `${C.STARS_WITHDRAW_PAGE}?${new URLSearchParams({ transaction })}`, true
    );
    const state = V.object(data.s, "Withdrawal state");
    if (!state.transaction || !state.withdrawalData) {
      throw new ParseError("Stars withdrawal state is missing or expired.");
    }
    return {
      transaction: V.text(state.transaction), withdrawalData: V.text(state.withdrawalData),
    };
  }

  /*
   * Submit a user-owned withdrawal request to an explicitly derived destination.
   *
   * Destination construction is offline and does not require a provider key.
   * Initialization and challenge approval remain separate public operations.
   * Server application errors are retained in withdrawal result models.
   */
  private async withdraw(
    method: string, transaction: string,
    confirmHash: string | null, extra: M.ApiObject = {}
  ): Promise<M.ApiObject> {
    this.requireAccount(method);
    const account = await this.account();
    return this.call(method, {
      ...extra, transaction, wallet_address: account.address,
      confirm_hash: confirmHash,
    });
  }

  private withdrawalInit(result: M.ApiObject): M.WithdrawalInitResult {
    return {
      ok: result.ok === true, error: V.nullableText(result.error),
      confirmMessage: V.nullableText(result.confirm_message),
      confirmButton: V.nullableText(result.confirm_button),
      confirmHash: V.nullableText(result.confirm_hash),
    };
  }

  private withdrawalConfirm(result: M.ApiObject): M.WithdrawalConfirmResult {
    return {
      ok: result.ok === true, needUpdate: result.need_update === true,
      mode: V.text(result.mode, result.error ? "error" : "unknown"),
      html: V.nullableText(result.html), error: V.nullableText(result.error),
    };
  }

  async initNftWithdrawal(transaction: string, keepGift = false): Promise<M.NftWithdrawalInitResult> {
    V.boolean(keepGift, "keepGift");
    return this.withdrawalInit(await this.withdraw("initNftWithdrawalRequest", transaction, null, {
      keep_gift: Number(keepGift),
    }));
  }

  async confirmNftWithdrawal(
    transaction: string, confirmHash: string, keepGift = false
  ): Promise<M.NftWithdrawalConfirmResult> {
    V.boolean(keepGift, "keepGift");
    return this.withdrawalConfirm(await this.withdraw("initNftWithdrawalRequest", transaction, confirmHash, {
      keep_gift: Number(keepGift),
    }));
  }

  async initStarsWithdrawal(
    transaction: string, withdrawalData: string
  ): Promise<M.StarsWithdrawalInitResult> {
    return this.withdrawalInit(await this.withdraw(
      "initStarsRevenueWithdrawalRequest", transaction, null, { withdrawal_data: withdrawalData }
    ));
  }

  async confirmStarsWithdrawal(
    transaction: string, withdrawalData: string, confirmHash: string
  ): Promise<M.StarsWithdrawalConfirmResult> {
    return this.withdrawalConfirm(await this.withdraw(
      "initStarsRevenueWithdrawalRequest", transaction, confirmHash,
      { withdrawal_data: withdrawalData }
    ));
  }

  async initAdsWithdrawal(transactionId: string): Promise<M.AdsWithdrawalInitResult> {
    return this.withdrawalInit(await this.withdraw(
      "initAdsRevenueWithdrawalRequest", transactionId, null
    ));
  }

  async confirmAdsWithdrawal(
    transactionId: string, confirmHash: string
  ): Promise<M.AdsWithdrawalConfirmResult> {
    return this.withdrawalConfirm(await this.withdraw(
      "initAdsRevenueWithdrawalRequest", transactionId, confirmHash
    ));
  }

  async confirmRequest(
    reqId: string, boc: string, referer = "stars/buy"
  ): Promise<M.ApiObject> {
    return this.api("confirmReq", { id: reqId, boc },
      `${C.FRAGMENT_BASE_URL}/${referer.replace(/^\/+/, "")}`);
  }
}