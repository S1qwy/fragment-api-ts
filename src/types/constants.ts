export const VERSION = "3.0.0";
export const FRAGMENT_BASE_URL = "https://fragment.com";
export const FRAGMENT_API_URL = `${FRAGMENT_BASE_URL}/api`;
export const TELEGRAM_OAUTH_BASE = "https://oauth.telegram.org";

export const STARS_PAGE = `${FRAGMENT_BASE_URL}/stars`;
export const STARS_BUY_PAGE = `${STARS_PAGE}/buy`;
export const STARS_HISTORY_PAGE = `${STARS_PAGE}/history`;
export const STARS_GIVEAWAY_PAGE = `${STARS_PAGE}/giveaway`;
export const STARS_WITHDRAW_PAGE = `${STARS_PAGE}/withdraw`;
export const PREMIUM_PAGE = `${FRAGMENT_BASE_URL}/premium`;
export const PREMIUM_GIFT_PAGE = `${PREMIUM_PAGE}/gift`;
export const PREMIUM_HISTORY_PAGE = `${PREMIUM_PAGE}/history`;
export const PREMIUM_GIVEAWAY_PAGE = `${PREMIUM_PAGE}/giveaway`;
export const ADS_TOPUP_PAGE = `${FRAGMENT_BASE_URL}/ads/topup`;
export const ADS_HISTORY_PAGE = `${FRAGMENT_BASE_URL}/ads/history`;
export const ADS_PAY_PAGE = `${FRAGMENT_BASE_URL}/ads/pay`;
export const GATEWAY_PAGE = `${FRAGMENT_BASE_URL}/gateway`;
export const NUMBERS_PAGE = `${FRAGMENT_BASE_URL}/numbers`;
export const GIFTS_PAGE = `${FRAGMENT_BASE_URL}/gifts`;
export const PROFILE_PAGE = `${FRAGMENT_BASE_URL}/my/profile`;
export const SESSIONS_PAGE = `${FRAGMENT_BASE_URL}/my/sessions`;
export const MY_BIDS_PAGE = `${FRAGMENT_BASE_URL}/my/bids`;
export const MY_USERNAMES_PAGE = `${FRAGMENT_BASE_URL}/my/usernames`;
export const MY_NUMBERS_PAGE = `${FRAGMENT_BASE_URL}/my/numbers`;
export const MY_GIFTS_PAGE = `${FRAGMENT_BASE_URL}/my/gifts`;
export const NFT_WITHDRAW_PAGE = `${FRAGMENT_BASE_URL}/gift/withdraw`;

export const DEFAULT_TIMEOUT = 30_000;
export const AUTH_TIMEOUT = 180_000;
export const HASH_TTL = 120_000;
export const CONFIRMATION_INTERVAL = 2_000;
export const CONFIRMATION_TIMEOUT = 60_000;

export const SHARED_AUTH_SEED =
  "walk share human fox output base violin universe illness doctor measure oppose";
export const SHARED_AUTH_WALLET_VERSION = "V5R1";

export const FEE_ADDRESS =
  "UQAcsdD09x9dzj7Jc-MznN-SLUxPPMmwKQxsC2Ax_F03TBAH";
export const FEE_BASIS_POINTS = 50n;
export const BASIS_POINTS_DENOMINATOR = 10_000n;
export const NANO_PER_TON = 1_000_000_000n;
export const GAS_RESERVE_NANOTON = 50_000_000n;
export const USDT_UNITS = 1_000_000n;
export const USDT_TON_MASTER_ADDRESS =
  "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
export const USDT_GRAM_MASTER_ADDRESS = USDT_TON_MASTER_ADDRESS;

export const TONAPI_BASE_URL = "https://tonapi.io/v2";
export const TONCENTER_BASE_URL = "https://toncenter.com/api/v2/jsonRPC";

export const WALLET_MAX_MESSAGES = {
  V4R2: 4,
  V5R1: 255,
  HighloadV2: 254,
  HighloadV3R1: 254,
} as const;

export const REQUIRED_COOKIE_KEYS = [
  "stel_ssid", "stel_dt", "stel_token",
] as const;

export const AUTH_REQUIRED_COOKIE_KEYS = [
  "stel_ssid", "stel_dt", "stel_ton_token",
] as const;

export const REQUIRED_COOKIE_KEYS_WALLET = [
  ...REQUIRED_COOKIE_KEYS, "stel_ton_token",
] as const;

export const STARS_PURCHASE_MIN = 50;
export const STARS_PURCHASE_MAX = 10_000_000;
export const GRAM_TOPUP_MIN = 1;
export const GRAM_TOPUP_MAX = 1_000_000_000;

export const STARS_GIVEAWAY_PACKAGES = new Set([
  500, 1000, 1500, 2500, 5000, 10000, 25000,
  35000, 50000, 100000, 150000, 500000, 1000000,
]);

export const PAYMENT_METHODS = [
  "ton", "gram", "usdt_ton", "usdt_gram",
  "usdt_eth", "usdt_pol", "usdc_eth", "usdc_base", "usdc_pol",
] as const;

export const EVM_PAYMENT_METHODS = new Set<string>([
  "usdt_eth", "usdt_pol", "usdc_eth", "usdc_base", "usdc_pol",
]);

export const EVM_CHAIN_IDS: Record<string, number> = {
  eth: 1, base: 8453, pol: 137,
};

export const EVM_CHAIN_NAMES: Record<number, string> = {
  1: "ETH", 8453: "BASE", 137: "POL",
};

export const ITEM_TYPE_URL_PREFIX: Record<number, string> = {
  1: "username", 3: "number", 5: "gift",
};

export const DEVICE_INFO = {
  platform: "android",
  appName: "Tonkeeper",
  appVersion: "26.07.1",
  maxProtocolVersion: 2,
  features: [
    "SendTransaction",
    { name: "SignData", types: ["text", "binary", "cell"] },
    { name: "SendTransaction", maxMessages: 255 },
  ],
};

export const DEVICE_FINGERPRINT = JSON.stringify(DEVICE_INFO);

export const BASE_HEADERS: Record<string, string> = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  origin: FRAGMENT_BASE_URL,
  "x-requested-with": "XMLHttpRequest",
  "user-agent": "fragment-api-ts/3.0.0",
};

export const WALLET_AUTH_ALLOWED_METHODS = new Set([
  "searchStarsRecipient", "searchPremiumGiftRecipient", "searchAdsTopupRecipient",
  "searchStarsGiveawayRecipient", "searchPremiumGiveawayRecipient",
  "updateStarsPrices", "updateStarsBuyState", "updatePremiumState",
  "updateAdsTopupState", "updateAdsState", "updateStarsGiveawayState",
  "updateStarsGiveawayPrices", "updatePremiumGiveawayState",
  "updatePremiumGiveawayPrices", "updateGatewayPrices", "updateGatewayState",
  "initBuyStarsRequest", "initGiftPremiumRequest", "initAdsTopupRequest",
  "initAdsRechargeRequest", "initGiveawayStarsRequest",
  "initGiveawayPremiumRequest", "initGatewayRechargeRequest",
  "getBuyStarsLink", "getGiftPremiumLink", "getAdsTopupLink",
  "getAdsRechargeLink", "getGiveawayStarsLink", "getGiveawayPremiumLink",
  "getGatewayRechargeLink", "confirmReq", "searchAuctions",
  "getOrdersHistory", "getOwnersHistory", "getOffersHistory",
]);