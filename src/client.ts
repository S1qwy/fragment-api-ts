import {
  ConfigurationError,
  CookieError,
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  fmt,
} from "./exceptions";
import {
  DEFAULT_TIMEOUT,
  DEVICE_FINGERPRINT,
  FRAGMENT_BASE_URL,
  REQUIRED_COOKIE_KEYS,
  SUPPORTED_API_PROVIDERS,
  SUPPORTED_WALLET_VERSIONS,
  ADS_HISTORY_PAGE,
  ADS_TOPUP_PAGE,
  GIFTS_PAGE,
  MY_BIDS_PAGE,
  MY_GIFTS_PAGE,
  MY_NUMBERS_PAGE,
  MY_USERNAMES_PAGE,
  NFT_WITHDRAW_PAGE,
  NUMBERS_PAGE,
  PREMIUM_GIFT_PAGE,
  PREMIUM_GIVEAWAY_PAGE,
  PREMIUM_HISTORY_PAGE,
  PROFILE_PAGE,
  SESSIONS_PAGE,
  STARS_BUY_PAGE,
  STARS_GIVEAWAY_PAGE,
  STARS_HISTORY_PAGE,
  STARS_PAGE,
  STARS_WITHDRAW_PAGE,
} from "./types/constants";
import {
  AdsTopupResult,
  AdsWithdrawalConfirmResult,
  AdsWithdrawalInitResult,
  AssignAccountsResult,
  AssignResult,
  BatchResult,
  BidResult,
  EvmPaymentResult,
  GatewayPriceInfo,
  GatewayRechargeResult,
  GiftInfo,
  GiftsResult,
  GiveawayPremiumResult,
  GiveawayStarsResult,
  LoginCodeResult,
  MyAssetsResult,
  MyBidsResult,
  NftTransferRecipient,
  NftTransferRequest,
  NftWithdrawalConfirmResult,
  NftWithdrawalInitResult,
  NumberInfo,
  NumbersResult,
  OfferResult,
  PremiumPrices,
  PremiumResult,
  PremiumTransaction,
  ProfileInfo,
  PurchaseItem,
  PurchaseResult,
  RecipientInfo,
  SessionInfo,
  StarsPrice,
  StarsPrices,
  StarsResult,
  StarsTransaction,
  StarsWithdrawalConfirmResult,
  StarsWithdrawalInitResult,
  StarsWithdrawalState,
  StartAuctionResult,
  SubscriptionResult,
  TerminateSessionsResult,
  TopupTransaction,
  TransactionResult,
  UsernameInfo,
  UsernamesResult,
  WalletInfo,
} from "./types/results";
import { authenticate } from "./utils/auth";
import {
  parseAssignAccounts,
  parseAuctionInfo,
  parseBidHistory,
  parseGiftAttributes,
  parseGiftIssued,
  parseItemStatus,
  parseMyAssets,
  parseMyBids,
  parseOfferHistory,
  parseOwnerHistory,
  parsePremiumHistory,
  parsePremiumOptions,
  parseProfile,
  parseSessions,
  parseSoldOwner,
  parseStarsHistory,
  parseStarsPackages,
  parseStarsPriceFromHtml,
  parseTopupHistory,
} from "./utils/html";
import {
  buildHeaders,
  fetchFragmentHash,
  fetchPageAjax,
  postFragmentApi,
} from "./utils/http";
import {
  buildAccountInfo,
  executeTransaction,
  fetchWalletInfo,
} from "./utils/wallet";
import {
  purchase,
  batchPurchase,
  purchaseStars,
  purchasePremium,
  topupGram,
  topupTon,
} from "./methods/purchase";
import { giveawayPremium, giveawayStars } from "./methods/giveaway";
import { placeBid } from "./methods/placeBid";
import { searchGifts, searchNumbers, searchUsernames } from "./methods/search";
import {
  getLoginCode,
  toggleLoginCodes,
  terminateSessions,
} from "./methods/anonymousNumber";
import {
  cancelAuction as _cancelAuction,
  confirmAdsWithdrawal as _confirmAdsWithdrawal,
  getGatewayPrice as _getGatewayPrice,
  initAdsWithdrawal as _initAdsWithdrawal,
  makeOffer as _makeOffer,
  rechargeGateway as _rechargeGateway,
  subscribeToItem as _subscribeToItem,
  unsubscribeFromItem as _unsubscribeFromItem,
} from "./methods/marketplace";
import { SessionStorage } from "./storage/base";

function parseRecipientFromResult(result: Record<string, any>): RecipientInfo | null {
  const found = result.found;
  if (!found || !found.recipient) return null;
  const photoHtml = found.photo || "";
  const photoMatch = /src="([^"]+)"/.exec(photoHtml);
  return {
    recipient: found.recipient,
    name: found.name || "",
    photoUrl: photoMatch ? photoMatch[1] : null,
    myself: found.myself || false,
  };
}

export class FragmentClient {
  cookies: Record<string, string>;
  timeout: number;
  seed: string | null;
  apiKey: string | null;
  apiProvider: string;
  walletVersion: string;
  proxy: string | null;
  private _hasTonToken: boolean;
  private _sessionStorage: SessionStorage | null;
  private _sessionId: string | null;
  private _autoRefresh: boolean;

  constructor(params: {
    cookies: Record<string, string> | string;
    seed?: string | null;
    apiKey?: string | null;
    apiProvider?: string;
    walletVersion?: string;
    timeout?: number;
    proxy?: string | null;
    sessionStorage?: SessionStorage | null;
    sessionId?: string | null;
    autoRefreshCookies?: boolean;
  }) {
    if (!params.cookies) {
      throw new ConfigurationError(
        "Fragment cookies are required. Provide cookies when creating FragmentClient."
      );
    }

    let parsedCookies: Record<string, string>;
    if (typeof params.cookies === "string") {
      const cookiesStr = params.cookies.trim();
      if (!cookiesStr) throw new CookieError("Cookies string is empty.");
      if (cookiesStr.startsWith("{")) {
        try {
          parsedCookies = JSON.parse(cookiesStr);
        } catch (exc) {
          throw new CookieError(fmt(CookieError.READ_FAILED, { exc: String(exc) }));
        }
      } else {
        parsedCookies = {};
        for (const item of cookiesStr.split(";")) {
          if (item.includes("=")) {
            const [k, ...rest] = item.trim().split("=");
            parsedCookies[k] = rest.join("=");
          }
        }
      }
    } else {
      parsedCookies = { ...params.cookies };
    }

    const missingBase = REQUIRED_COOKIE_KEYS.filter(
      (k) => !(parsedCookies[k] || "").trim()
    );
    if (missingBase.length) {
      throw new CookieError(fmt(CookieError.MISSING_KEYS, { keys: missingBase.join(", ") }));
    }

    this.cookies = parsedCookies;
    this.timeout = params.timeout || DEFAULT_TIMEOUT;
    this._hasTonToken = !!(parsedCookies.stel_ton_token || "").trim();

    this.seed = null;
    this.apiKey = null;
    this.apiProvider = "tonapi";
    this.walletVersion = "V5R1";
    this.proxy = params.proxy?.trim() || null;
    this._sessionStorage = params.sessionStorage || null;
    this._sessionId = params.sessionId || null;
    this._autoRefresh = params.autoRefreshCookies || false;

    if (params.seed && params.seed.trim()) {
      const wordCount = params.seed.trim().split(/\s+/).length;
      if (![12, 18, 24].includes(wordCount)) {
        throw new ConfigurationError(
          fmt(ConfigurationError.INVALID_MNEMONIC, { count: wordCount })
        );
      }
      this.seed = params.seed.trim();
    }

    if (params.apiKey && params.apiKey.trim()) {
      this.apiKey = params.apiKey.trim();
    }

    const provider = (params.apiProvider || "tonapi").trim().toLowerCase();
    if (!SUPPORTED_API_PROVIDERS.has(provider)) {
      throw new ConfigurationError(
        fmt(ConfigurationError.UNSUPPORTED_PROVIDER, {
          provider: params.apiProvider || provider,
          supported: [...SUPPORTED_API_PROVIDERS].sort().join(", "),
        })
      );
    }
    this.apiProvider = provider;

    const version = (params.walletVersion || "V5R1").trim().toUpperCase();
    if (!SUPPORTED_WALLET_VERSIONS.has(version)) {
      throw new ConfigurationError(
        fmt(ConfigurationError.UNSUPPORTED_VERSION, {
          version,
          supported: [...SUPPORTED_WALLET_VERSIONS].sort().join(", "),
        })
      );
    }
    this.walletVersion = version;
  }

  get hasWallet(): boolean {
    return this.seed !== null && this.apiKey !== null;
  }

  get hasTonToken(): boolean {
    return this._hasTonToken;
  }

  get sessionStorage(): SessionStorage | null {
    return this._sessionStorage;
  }

  requireCookies(): Record<string, string> {
    if (!this.cookies) {
      throw new ConfigurationError("This operation requires Fragment cookies.");
    }
    return this.cookies;
  }

  requireWallet(): void {
    if (!this.seed) throw new ConfigurationError(ConfigurationError.SEED_REQUIRED);
    if (!this.apiKey) throw new ConfigurationError(ConfigurationError.API_KEY_REQUIRED);
  }

  requireTonToken(): void {
    if (!this._hasTonToken) {
      throw new ConfigurationError(ConfigurationError.TON_TOKEN_REQUIRED);
    }
  }

  private async _saveCookies(): Promise<void> {
    if (this._sessionStorage && this._sessionId) {
      try {
        await this._sessionStorage.save(this._sessionId, this.cookies);
      } catch {}
    }
  }

  /**
   * Re-authenticate and refresh session cookies.
   */
  async refreshCookies(): Promise<Record<string, string>> {
    if (!this.seed) {
      throw new ConfigurationError(ConfigurationError.SEED_REQUIRED);
    }
    const newCookies = await authenticate({ seed: this.seed, walletVersion: this.walletVersion, timeout: this.timeout });
    this.cookies = newCookies;
    this._hasTonToken = !!(newCookies.stel_ton_token || "").trim();
    await this._saveCookies();
    return newCookies;
  }

  /**
   * Create a FragmentClient from stored session cookies.
   */
  static async fromStorage(params: {
    sessionStorage: SessionStorage;
    sessionId: string;
    seed?: string | null;
    apiKey?: string | null;
    apiProvider?: string;
    walletVersion?: string;
    timeout?: number;
    proxy?: string | null;
    autoRefreshCookies?: boolean;
  }): Promise<FragmentClient> {
    let cookies = await params.sessionStorage.load(params.sessionId);
    if (!cookies) {
      if (params.seed) {
        cookies = await authenticate({
          seed: params.seed,
          walletVersion: params.walletVersion,
          timeout: params.timeout,
        });
        await params.sessionStorage.save(params.sessionId, cookies);
      } else {
        throw new CookieError(
          `No stored session found for '${params.sessionId}' and no seed provided for authentication.`
        );
      }
    }

    return new FragmentClient({
      cookies,
      seed: params.seed,
      apiKey: params.apiKey,
      apiProvider: params.apiProvider,
      walletVersion: params.walletVersion,
      timeout: params.timeout,
      proxy: params.proxy,
      sessionStorage: params.sessionStorage,
      sessionId: params.sessionId,
      autoRefreshCookies: params.autoRefreshCookies,
    });
  }

  static async authenticate(params: {
    seed: string;
    walletVersion?: string;
    phone?: string;
    printQr?: boolean;
    onStatus?: (status: string, payload: any) => void;
    timeout?: number;
  }): Promise<Record<string, string>> {
    return authenticate(params);
  }

  async getStarsRecipient(username: string): Promise<RecipientInfo | null> {
    try {
      const headers = buildHeaders(STARS_PAGE);
      const fragmentHash = await fetchFragmentHash(
        this.cookies, headers, STARS_PAGE, this.timeout
      );
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "searchStarsRecipient", query: username, quantity: "" },
        this.timeout
      );
      return parseRecipientFromResult(result);
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getPremiumRecipient(username: string, months: number = 3): Promise<RecipientInfo | null> {
    try {
      const headers = buildHeaders(PREMIUM_GIFT_PAGE);
      const fragmentHash = await fetchFragmentHash(
        this.cookies, headers, PREMIUM_GIFT_PAGE, this.timeout
      );
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "searchPremiumGiftRecipient", query: username, months },
        this.timeout
      );
      return parseRecipientFromResult(result);
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getAdsTopupRecipient(username: string): Promise<RecipientInfo | null> {
    this.requireTonToken();
    try {
      const headers = buildHeaders(ADS_TOPUP_PAGE);
      const fragmentHash = await fetchFragmentHash(
        this.cookies, headers, ADS_TOPUP_PAGE, this.timeout
      );
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "searchAdsTopupRecipient", query: username },
        this.timeout
      );
      return parseRecipientFromResult(result);
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getGiveawayStarsRecipient(
    channel: string, winners: number = 1, amount: number = 500
  ): Promise<RecipientInfo | null> {
    try {
      const headers = buildHeaders(STARS_GIVEAWAY_PAGE);
      const fragmentHash = await fetchFragmentHash(
        this.cookies, headers, STARS_GIVEAWAY_PAGE, this.timeout
      );
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "searchStarsGiveawayRecipient", query: channel, quantity: winners, stars: amount },
        this.timeout
      );
      return parseRecipientFromResult(result);
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getGiveawayPremiumRecipient(
    channel: string, winners: number = 1, months: number = 3
  ): Promise<RecipientInfo | null> {
    try {
      const headers = buildHeaders(PREMIUM_GIVEAWAY_PAGE);
      const fragmentHash = await fetchFragmentHash(
        this.cookies, headers, PREMIUM_GIVEAWAY_PAGE, this.timeout
      );
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "searchPremiumGiveawayRecipient", query: channel, quantity: winners, months },
        this.timeout
      );
      return parseRecipientFromResult(result);
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async purchase(
    itemsOrType: Array<Record<string, any> | PurchaseItem> | Record<string, any> | PurchaseItem | string,
    username?: string | null,
    amount?: number | null,
    months?: number | null,
    showSender: boolean = true,
    paymentMethod: string = "gram"
  ): Promise<PurchaseResult | BatchResult | EvmPaymentResult> {
    return purchase(this, itemsOrType, username, amount, months, showSender, paymentMethod);
  }

  async batchPurchase(
    items: Array<Record<string, any> | PurchaseItem>,
    paymentMethod: string = "gram"
  ): Promise<BatchResult> {
    return batchPurchase(this, items, paymentMethod);
  }

  async purchaseStars(
    username: string, amount: number, showSender: boolean = true, paymentMethod: string = "gram"
  ): Promise<PurchaseResult | EvmPaymentResult> {
    return purchaseStars(this, username, amount, showSender, paymentMethod);
  }

  async purchasePremium(
    username: string, months: number, showSender: boolean = true, paymentMethod: string = "gram"
  ): Promise<PurchaseResult | EvmPaymentResult> {
    return purchasePremium(this, username, months, showSender, paymentMethod);
  }

  async topupGram(username: string, amount: number, showSender: boolean = true): Promise<PurchaseResult> {
    this.requireTonToken();
    return topupGram(this, username, amount, showSender);
  }

  async topupTon(username: string, amount: number, showSender: boolean = true): Promise<PurchaseResult> {
    return this.topupGram(username, amount, showSender);
  }

  async giveawayStars(
    channel: string, winners: number, amount: number, paymentMethod: string = "gram"
  ): Promise<GiveawayStarsResult | EvmPaymentResult> {
    return giveawayStars(this, channel, winners, amount, paymentMethod);
  }

  async giveawayPremium(
    channel: string, winners: number, months: number = 3, paymentMethod: string = "gram"
  ): Promise<GiveawayPremiumResult | EvmPaymentResult> {
    return giveawayPremium(this, channel, winners, months, paymentMethod);
  }

  async placeBid(itemType: number, slug: string, bid: number): Promise<BidResult> {
    this.requireTonToken();
    return placeBid(this, itemType, slug, bid);
  }

  async makeOffer(itemType: number, slug: string, amount: number): Promise<OfferResult> {
    this.requireTonToken();
    return _makeOffer(this, itemType, slug, amount);
  }

  async cancelAuction(itemType: number, slug: string): Promise<TransactionResult> {
    this.requireTonToken();
    return _cancelAuction(this, itemType, slug);
  }

  async subscribeToItem(itemType: number, slug: string): Promise<SubscriptionResult> {
    return _subscribeToItem(this, itemType, slug);
  }

  async unsubscribeFromItem(itemType: number, slug: string): Promise<SubscriptionResult> {
    return _unsubscribeFromItem(this, itemType, slug);
  }

  async initAdsWithdrawal(transactionId: string): Promise<AdsWithdrawalInitResult> {
    return _initAdsWithdrawal(this, transactionId);
  }

  async confirmAdsWithdrawal(transactionId: string, confirmHash: string): Promise<AdsWithdrawalConfirmResult> {
    return _confirmAdsWithdrawal(this, transactionId, confirmHash);
  }

  async getGatewayPrice(accountId: string, credits: number): Promise<GatewayPriceInfo> {
    return _getGatewayPrice(this, accountId, credits);
  }

  async rechargeGateway(accountId: string, credits: number): Promise<GatewayRechargeResult> {
    return _rechargeGateway(this, accountId, credits);
  }

  async getWallet(): Promise<WalletInfo> {
    this.requireWallet();
    this.requireTonToken();
    return fetchWalletInfo(this);
  }

  async searchUsernames(
    query: string = "", sort?: string | null, filter?: string | null, offsetId?: string | null
  ): Promise<UsernamesResult> {
    return searchUsernames(this, query, sort, filter, offsetId);
  }

  async searchNumbers(
    query: string = "", sort?: string | null, filter?: string | null, offsetId?: string | null
  ): Promise<NumbersResult> {
    return searchNumbers(this, query, sort, filter, offsetId);
  }

  async searchGifts(
    query: string = "", collection?: string | null, sort?: string | null,
    filter?: string | null, view?: string | null,
    attr?: Record<string, string[]> | null, offset?: number | null
  ): Promise<GiftsResult> {
    return searchGifts(this, query, collection, sort, filter, view, attr, offset);
  }

  async getUsernameInfo(username: string): Promise<UsernameInfo> {
    try {
      const url = `${FRAGMENT_BASE_URL}/username/${username.replace(/^@/, "")}`;
      const headers = buildHeaders(url);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);

      const html = data.h || "";
      const state = data.s || {};

      const status = parseItemStatus(html);
      const auction = parseAuctionInfo(html);
      const [bids, bidOffset] = parseBidHistory(html);
      const [owners, ownerOffset] = parseOwnerHistory(html);
      const [offers, offerOffset] = parseOfferHistory(html);

      const timerM = /class="tm-countdown-timer"[^>]*datetime="([^"]+)"/.exec(html);
      const auctionEnd = timerM ? timerM[1] : null;
      const ownerWallet = parseSoldOwner(html);
      const purchasedM = /Purchased on\s*<time[^>]+datetime="([^"]+)"/.exec(html);
      const purchasedDate = purchasedM ? purchasedM[1] : null;

      return {
        username: state.username || username.replace(/^@/, ""),
        status,
        itemType: state.type || 1,
        gramRate: state.tonRate || 0.0,
        auction,
        auctionEnd,
        ownerWallet,
        purchasedDate,
        bidHistory: bids,
        ownerHistory: owners,
        offerHistory: offers,
        bidHistoryNextOffset: bidOffset,
        ownerHistoryNextOffset: ownerOffset,
        offerHistoryNextOffset: offerOffset,
      };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getNumberInfo(number: string): Promise<NumberInfo> {
    try {
      const clean = number.replace(/[+\s-]/g, "");
      const url = `${FRAGMENT_BASE_URL}/number/${clean}`;
      const headers = buildHeaders(url);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);

      const html = data.h || "";
      const state = data.s || {};

      const status = parseItemStatus(html);
      const restricted = /tm-status-restricted/.test(html);
      const auction = parseAuctionInfo(html);
      const [bids, bidOffset] = parseBidHistory(html);
      const [owners, ownerOffset] = parseOwnerHistory(html);
      const [offers, offerOffset] = parseOfferHistory(html);

      const timerM = /class="tm-countdown-timer"[^>]*datetime="([^"]+)"/.exec(html);
      const auctionEnd = timerM ? timerM[1] : null;
      const ownerWallet = parseSoldOwner(html);
      const purchasedM = /Purchased on\s*<time[^>]+datetime="([^"]+)"/.exec(html);
      const purchasedDate = purchasedM ? purchasedM[1] : null;

      return {
        number: state.username || clean,
        displayNumber: state.itemTitle || `+${clean}`,
        status,
        itemType: state.type || 3,
        gramRate: state.tonRate || 0.0,
        restricted,
        auction,
        auctionEnd,
        ownerWallet,
        purchasedDate,
        bidHistory: bids,
        ownerHistory: owners,
        offerHistory: offers,
        bidHistoryNextOffset: bidOffset,
        ownerHistoryNextOffset: ownerOffset,
        offerHistoryNextOffset: offerOffset,
      };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getGiftInfo(slug: string): Promise<GiftInfo> {
    try {
      const url = `${FRAGMENT_BASE_URL}/gift/${slug}`;
      const headers = buildHeaders(url);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);

      const html = data.h || "";
      const state = data.s || {};

      const status = parseItemStatus(html);
      const auction = parseAuctionInfo(html);
      const [bids, bidOffset] = parseBidHistory(html);
      const [owners, ownerOffset] = parseOwnerHistory(html);
      const [offers, offerOffset] = parseOfferHistory(html);
      const attributes = parseGiftAttributes(html);
      const issued = parseGiftIssued(html);

      const timerM = /class="tm-countdown-timer"[^>]*datetime="([^"]+)"/.exec(html);
      const auctionEnd = timerM ? timerM[1] : null;
      const ownerWallet = parseSoldOwner(html);
      const purchasedM = /Purchased on\s*<time[^>]+datetime="([^"]+)"/.exec(html);
      const purchasedDate = purchasedM ? purchasedM[1] : null;

      const imageM = /<img\s+src="(https:\/\/nft\.fragment\.com\/gift\/[^"]+)"/.exec(html);
      const imageUrl = imageM ? imageM[1] : null;
      const stickerM = /srcset="(https:\/\/nft\.fragment\.com\/gift\/[^"]+\.tgs)"/.exec(html);
      const stickerUrl = stickerM ? stickerM[1] : null;

      return {
        slug: state.username || slug,
        name: state.itemTitle || slug,
        status,
        itemType: state.type || 5,
        gramRate: state.tonRate || 0.0,
        imageUrl,
        stickerUrl,
        ownerWallet,
        purchasedDate,
        auction,
        auctionEnd,
        attributes,
        issued,
        bidHistory: bids,
        ownerHistory: owners,
        offerHistory: offers,
        bidHistoryNextOffset: bidOffset,
        ownerHistoryNextOffset: ownerOffset,
        offerHistoryNextOffset: offerOffset,
      };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getStarsPrices(): Promise<StarsPrices> {
    try {
      const headers = buildHeaders(STARS_BUY_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, STARS_BUY_PAGE, this.timeout);
      const html = data.h || "";
      const state = data.s || {};
      const packages = parseStarsPackages(html);
      return { packages, gramRate: state.tonRate || 0.0 };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getStarsPrice(quantity: number): Promise<StarsPrice> {
    try {
      const headers = buildHeaders(STARS_PAGE);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, STARS_PAGE, this.timeout);
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { stars: "0", quantity: String(quantity), method: "updateStarsPrices" },
        this.timeout
      );
      const curPriceHtml = result.cur_price || "";
      const [gramPrice, usdPrice] = parseStarsPriceFromHtml(curPriceHtml);
      return { stars: quantity, gramPrice: gramPrice || "0", usdPrice: usdPrice || "0" };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getPremiumPrices(): Promise<PremiumPrices> {
    try {
      const headers = buildHeaders(PREMIUM_GIFT_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, PREMIUM_GIFT_PAGE, this.timeout);
      const html = data.h || "";
      const state = data.s || {};
      const options = parsePremiumOptions(html);
      return { options, gramRate: state.tonRate || 0.0 };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getStarsHistory(sort: string = "desc"): Promise<StarsTransaction[]> {
    this.requireTonToken();
    try {
      const url = `${STARS_HISTORY_PAGE}?sort=${sort}`;
      const headers = buildHeaders(STARS_HISTORY_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);
      return parseStarsHistory(data.h || "");
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getPremiumHistory(sort: string = "desc"): Promise<PremiumTransaction[]> {
    this.requireTonToken();
    try {
      const url = `${PREMIUM_HISTORY_PAGE}?sort=${sort}`;
      const headers = buildHeaders(PREMIUM_HISTORY_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);
      return parsePremiumHistory(data.h || "");
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getTopupHistory(sort: string = "asc"): Promise<TopupTransaction[]> {
    this.requireTonToken();
    try {
      const url = `${ADS_HISTORY_PAGE}?type=topup&sort=${sort}`;
      const headers = buildHeaders(ADS_HISTORY_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);
      return parseTopupHistory(data.h || "");
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    this.requireTonToken();
    try {
      const headers = buildHeaders(PROFILE_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, PROFILE_PAGE, this.timeout);
      const html = data.h || "";
      const js = data.j || "";
      return parseProfile(html + js);
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getMyBids(itemType: string = "usernames", sort: string = "desc"): Promise<MyBidsResult> {
    this.requireTonToken();
    try {
      if (!["usernames", "numbers", "gifts"].includes(itemType)) {
        throw new ConfigurationError(`Invalid item_type: ${itemType}`);
      }
      const params: string[] = [];
      if (itemType !== "usernames") params.push(`type=${itemType}`);
      if (sort) params.push(`sort=${sort}`);
      const url = MY_BIDS_PAGE + (params.length ? `?${params.join("&")}` : "");
      const headers = buildHeaders(MY_BIDS_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);
      const html = data.h || "";
      const [items, totalCount] = parseMyBids(html, itemType);
      const gramRate = (data.s || {}).tonRate || 0.0;
      return { items, gramRate, totalCount };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getMyAssets(itemType: string = "usernames"): Promise<MyAssetsResult> {
    this.requireTonToken();
    try {
      const pageMap: Record<string, string> = {
        usernames: MY_USERNAMES_PAGE,
        numbers: MY_NUMBERS_PAGE,
        gifts: MY_GIFTS_PAGE,
      };
      if (!pageMap[itemType]) {
        throw new ConfigurationError(`Invalid item_type: ${itemType}`);
      }
      const url = pageMap[itemType];
      const headers = buildHeaders(url);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);
      const html = data.h || "";
      const [items, totalCount] = parseMyAssets(html, itemType);
      const gramRate = (data.s || {}).tonRate || 0.0;
      return { items, gramRate, totalCount };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getAssignAccounts(itemType: number, _slug: string): Promise<AssignAccountsResult> {
    this.requireTonToken();
    try {
      const url = itemType === 1 ? MY_USERNAMES_PAGE : MY_GIFTS_PAGE;
      const headers = buildHeaders(url);
      const data = await fetchPageAjax(this.cookies, headers, url, this.timeout);
      const [accounts, canDisable] = parseAssignAccounts(data.h || "");
      return { accounts, canDisable };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async assignToTelegram(
    itemType: number, slug: string, assignTo?: string | null
  ): Promise<AssignResult> {
    this.requireTonToken();
    try {
      const url = `${FRAGMENT_BASE_URL}/` + (itemType === 1 ? `username/${slug}` : `gift/${slug}`);
      const headers = buildHeaders(url);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, url, this.timeout);

      const postData: Record<string, any> = {
        type: String(itemType), username: slug, method: "assignToTgAccount",
      };
      if (assignTo != null) postData.assign_to = assignTo;

      const result = await postFragmentApi(this.cookies, fragmentHash, headers, postData, this.timeout);

      if (result.error) return { ok: false, message: result.error };
      if (result.need_pay) {
        return { ok: true, needPay: true, reqId: result.req_id, amount: result.amount };
      }
      return { ok: result.ok || false, message: result.msg, assignName: result.assign_name };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async startAuction(
    itemType: number, slug: string, minAmount: number, maxAmount: number = 0
  ): Promise<StartAuctionResult> {
    this.requireTonToken();
    this.requireWallet();
    try {
      const url = `${FRAGMENT_BASE_URL}/` + (itemType === 1 ? `username/${slug}` : `gift/${slug}`);
      const headers = buildHeaders(url);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, url, this.timeout);

      const canSell = await this.call(
        "canSellItem",
        { type: String(itemType), username: slug, auction: maxAmount === 0 ? "true" : "false" },
        url
      );
      if (!canSell.ok) return { ok: false };

      const account = await buildAccountInfo(this);
      const transaction = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        {
          method: "getStartAuctionLink",
          account: JSON.stringify(account),
          device: DEVICE_FINGERPRINT,
          transaction: "1",
          type: String(itemType),
          username: slug,
          min_amount: String(minAmount),
          max_amount: String(maxAmount),
        },
        this.timeout
      );

      if (transaction.error) return { ok: false };

      const confirmParams = transaction.confirm_params || {};
      await executeTransaction(this, transaction);
      return { ok: true, reqId: confirmParams.id };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async sellAsset(itemType: number, slug: string, price: number): Promise<StartAuctionResult> {
    return this.startAuction(itemType, slug, price, price);
  }

  async searchNftTransferRecipient(query: string): Promise<NftTransferRecipient | null> {
    this.requireTonToken();
    try {
      const headers = buildHeaders(FRAGMENT_BASE_URL);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, FRAGMENT_BASE_URL, this.timeout);
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "searchNftTransferRecipient", query },
        this.timeout
      );
      if (result.error || !result.found) return null;
      const found = result.found;
      const photoMatch = /src="([^"]+)"/.exec(found.photo || "");
      return {
        myself: found.myself || false,
        recipient: found.recipient || "",
        name: found.name || "",
        photoUrl: photoMatch ? photoMatch[1] : null,
      };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async initNftTransfer(slug: string, recipient: string): Promise<NftTransferRequest> {
    this.requireTonToken();
    try {
      const url = `${FRAGMENT_BASE_URL}/gift/${slug}/transfer`;
      const headers = buildHeaders(url);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, url, this.timeout);
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "initNftTransferRequest", slug, recipient },
        this.timeout
      );
      if (result.error) throw new FragmentAPIError(result.error);
      return {
        reqId: result.req_id || "",
        myself: result.myself || false,
        itemTitle: result.item_title || "",
        content: result.content || "",
        button: result.button || "",
      };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async transferNft(reqId: string, showSender: boolean = true): Promise<TransactionResult> {
    this.requireTonToken();
    this.requireWallet();
    try {
      const account = await buildAccountInfo(this);
      const transaction = await this.call("getNftTransferLink", {
        account: JSON.stringify(account),
        device: DEVICE_FINGERPRINT,
        transaction: "1",
        id: reqId,
        show_sender: showSender ? "1" : "0",
      });
      const txResult = await executeTransaction(this, transaction);
      if (txResult.boc && reqId) {
        try { await this.confirmRequest(reqId, txResult.boc); } catch {}
      }
      return txResult;
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getSessions(): Promise<SessionInfo[]> {
    this.requireTonToken();
    try {
      const headers = buildHeaders(SESSIONS_PAGE);
      const data = await fetchPageAjax(this.cookies, headers, SESSIONS_PAGE, this.timeout);
      return parseSessions(data.h || "");
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    this.requireTonToken();
    try {
      const headers = buildHeaders(SESSIONS_PAGE);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, SESSIONS_PAGE, this.timeout);
      const result = await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { session_id: sessionId, method: "tonTerminateSession" },
        this.timeout
      );
      return result.ok || false;
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getOrdersHistory(itemType: number, username: string, offsetId: string): Promise<Record<string, any>> {
    try {
      let url: string;
      if (itemType === 1) url = `${FRAGMENT_BASE_URL}/username/${username}`;
      else if (itemType === 3) url = `${FRAGMENT_BASE_URL}/number/${username}`;
      else url = `${FRAGMENT_BASE_URL}/gift/${username}`;

      const headers = buildHeaders(url);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, url, this.timeout);
      return await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { type: String(itemType), username, offset_id: offsetId, method: "getOrdersHistory" },
        this.timeout
      );
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getOwnersHistory(itemType: number, username: string, offsetId: string): Promise<Record<string, any>> {
    try {
      let url: string;
      if (itemType === 1) url = `${FRAGMENT_BASE_URL}/username/${username}`;
      else if (itemType === 3) url = `${FRAGMENT_BASE_URL}/number/${username}`;
      else url = `${FRAGMENT_BASE_URL}/gift/${username}`;

      const headers = buildHeaders(url);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, url, this.timeout);
      return await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { type: String(itemType), username, offset_id: offsetId, method: "getOwnersHistory" },
        this.timeout
      );
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  /**
   * Load more offer history for an item.
   */
  async getOffersHistory(itemType: number, username: string, offsetId: string): Promise<Record<string, any>> {
    try {
      let url: string;
      if (itemType === 1) url = `${FRAGMENT_BASE_URL}/username/${username}`;
      else if (itemType === 3) url = `${FRAGMENT_BASE_URL}/number/${username}`;
      else url = `${FRAGMENT_BASE_URL}/gift/${username}`;

      const headers = buildHeaders(url);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, url, this.timeout);
      return await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { type: String(itemType), username, offset_id: offsetId, method: "getOffersHistory" },
        this.timeout
      );
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async getLoginCode(number: string): Promise<LoginCodeResult> {
    this.requireTonToken();
    return getLoginCode(this, number);
  }

  async toggleLoginCodes(number: string, canReceive: boolean): Promise<void> {
    this.requireTonToken();
    return toggleLoginCodes(this, number, canReceive);
  }

  async terminateSessions(number: string): Promise<TerminateSessionsResult> {
    this.requireTonToken();
    return terminateSessions(this, number);
  }

  async getNftWithdrawalState(transaction: string): Promise<Record<string, any>> {
    this.requireTonToken();
    try {
      const pageUrl = `${NFT_WITHDRAW_PAGE}?transaction=${transaction}`;
      const headers = buildHeaders(pageUrl);
      const data = await fetchPageAjax(this.cookies, headers, pageUrl, this.timeout);
      if (data.mode === "done" && (data.html || "").includes("expired")) {
        throw new FragmentAPIError(
          "NFT withdrawal session has expired. Please start the withdrawal process again."
        );
      }
      return data;
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async initNftWithdrawal(transaction: string, keepGift: boolean = false): Promise<NftWithdrawalInitResult> {
    this.requireTonToken();
    this.requireWallet();
    try {
      const walletInfo = await this.getWallet();
      const result = await this.call("initNftWithdrawalRequest", {
        transaction,
        wallet_address: walletInfo.address,
        keep_gift: keepGift ? "1" : "0",
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

  async confirmNftWithdrawal(
    transaction: string, confirmHash: string, keepGift: boolean = false
  ): Promise<NftWithdrawalConfirmResult> {
    this.requireTonToken();
    this.requireWallet();
    try {
      const walletInfo = await this.getWallet();
      const result = await this.call("initNftWithdrawalRequest", {
        transaction,
        wallet_address: walletInfo.address,
        keep_gift: keepGift ? "1" : "0",
        confirm_hash: confirmHash,
      });
      if (result.error) {
        return { ok: false, needUpdate: false, mode: "error", error: result.error };
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

  async getStarsWithdrawalState(transaction: string): Promise<StarsWithdrawalState> {
    this.requireTonToken();
    try {
      const pageUrl = `${STARS_WITHDRAW_PAGE}?transaction=${transaction}`;
      const headers = buildHeaders(pageUrl);
      const data = await fetchPageAjax(this.cookies, headers, pageUrl, this.timeout);
      if (data.mode === "done" && (data.html || "").includes("expired")) {
        throw new FragmentAPIError(
          "Stars withdrawal session has expired. Please start the withdrawal process again."
        );
      }
      const state = data.s || {};
      const txId = state.transaction;
      const withdrawalData = state.withdrawalData;
      if (!txId || !withdrawalData) {
        throw new FragmentAPIError(
          "Failed to extract transaction or withdrawalData from response."
        );
      }
      return { transaction: txId, withdrawalData };
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async initStarsWithdrawal(transaction: string, withdrawalData: string): Promise<StarsWithdrawalInitResult> {
    this.requireTonToken();
    this.requireWallet();
    try {
      const walletInfo = await this.getWallet();
      const result = await this.call("initStarsRevenueWithdrawalRequest", {
        transaction,
        wallet_address: walletInfo.address,
        withdrawal_data: withdrawalData,
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

  async confirmStarsWithdrawal(
    transaction: string, withdrawalData: string, confirmHash: string
  ): Promise<StarsWithdrawalConfirmResult> {
    this.requireTonToken();
    this.requireWallet();
    try {
      const walletInfo = await this.getWallet();
      const result = await this.call("initStarsRevenueWithdrawalRequest", {
        transaction,
        wallet_address: walletInfo.address,
        withdrawal_data: withdrawalData,
        confirm_hash: confirmHash,
      });
      if (result.error) {
        return { ok: false, needUpdate: false, mode: "error", error: result.error };
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

  async confirmRequest(
    reqId: string, boc: string, referer: string = "stars/buy"
  ): Promise<Record<string, any>> {
    this.requireTonToken();
    try {
      const pageUrl = `${FRAGMENT_BASE_URL}/${referer}`;
      const headers = buildHeaders(pageUrl);
      const fragmentHash = await fetchFragmentHash(this.cookies, headers, pageUrl, this.timeout);
      return await postFragmentApi(
        this.cookies, fragmentHash, headers,
        { method: "confirmReq", id: String(reqId), boc },
        this.timeout
      );
    } catch (exc) {
      if (exc instanceof FragmentError) throw exc;
      throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
    }
  }

  async call(
    method: string,
    data?: Record<string, any> | null,
    pageUrl: string = FRAGMENT_BASE_URL
  ): Promise<Record<string, any>> {
    const headers = buildHeaders(pageUrl);
    const fragmentHash = await fetchFragmentHash(this.cookies, headers, pageUrl, this.timeout);
    return postFragmentApi(
      this.cookies, fragmentHash, headers,
      { method, ...(data || {}) },
      this.timeout
    );
  }
}