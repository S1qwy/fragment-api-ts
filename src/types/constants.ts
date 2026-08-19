export const SUPPORTED_WALLET_VERSIONS = new Set(["V4R2", "V5R1"]);

export const WALLET_MAX_MESSAGES: Record<string, number> = {
  V4R2: 4,
  V5R1: 255,
};

export const SUPPORTED_API_PROVIDERS = new Set(["tonapi", "toncenter"]);

export const MIN_GRAM_BALANCE = 0.01;
export const MIN_TON_BALANCE = MIN_GRAM_BALANCE;
export const MIN_USDT_BALANCE = 0.01;
export const USDT_GRAM_MASTER_ADDRESS = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

export const DEFAULT_TIMEOUT = 30000;
export const CONFIRMATION_INTERVAL = 3000;
export const CONFIRMATION_MAX_ATTEMPTS = 40;

export const REQUIRED_COOKIE_KEYS = ["stel_ssid", "stel_dt", "stel_token"] as const;

export const REQUIRED_COOKIE_KEYS_WALLET = [
  "stel_ssid",
  "stel_dt",
  "stel_token",
  "stel_ton_token",
] as const;

export const AUTH_REQUIRED_COOKIE_KEYS = ["stel_ssid", "stel_dt"] as const;

export const TONAPI_BASE_URL = "https://tonapi.io/v2";
export const TONCENTER_BASE_URL = "https://toncenter.com/api/v2/jsonRPC";

export const FRAGMENT_DOMAIN = "fragment.com";
export const FRAGMENT_BASE_URL = `https://${FRAGMENT_DOMAIN}`;
export const STARS_PAGE = `${FRAGMENT_BASE_URL}/stars`;
export const STARS_BUY_PAGE = `${FRAGMENT_BASE_URL}/stars/buy`;
export const STARS_HISTORY_PAGE = `${FRAGMENT_BASE_URL}/stars/history`;
export const STARS_GIVEAWAY_PAGE = `${FRAGMENT_BASE_URL}/stars/giveaway`;
export const PREMIUM_PAGE = `${FRAGMENT_BASE_URL}/premium`;
export const PREMIUM_GIFT_PAGE = `${FRAGMENT_BASE_URL}/premium/gift`;
export const PREMIUM_HISTORY_PAGE = `${FRAGMENT_BASE_URL}/premium/history`;
export const PREMIUM_GIVEAWAY_PAGE = `${FRAGMENT_BASE_URL}/premium/giveaway`;
export const ADS_TOPUP_PAGE = `${FRAGMENT_BASE_URL}/ads/topup`;
export const ADS_HISTORY_PAGE = `${FRAGMENT_BASE_URL}/ads/history`;
export const NUMBERS_PAGE = `${FRAGMENT_BASE_URL}/numbers`;
export const GIFTS_PAGE = `${FRAGMENT_BASE_URL}/gifts`;
export const PROFILE_PAGE = `${FRAGMENT_BASE_URL}/my/profile`;
export const SESSIONS_PAGE = `${FRAGMENT_BASE_URL}/my/sessions`;
export const MY_BIDS_PAGE = `${FRAGMENT_BASE_URL}/my/bids`;
export const MY_ASSETS_PAGE = `${FRAGMENT_BASE_URL}/my/assets`;
export const MY_USERNAMES_PAGE = `${FRAGMENT_BASE_URL}/my/usernames`;
export const MY_GIFTS_PAGE = `${FRAGMENT_BASE_URL}/my/gifts`;
export const MY_NUMBERS_PAGE = `${FRAGMENT_BASE_URL}/my/numbers`;
export const STARS_WITHDRAW_PAGE = `${FRAGMENT_BASE_URL}/stars/withdraw`;
export const NFT_WITHDRAW_PAGE = `${FRAGMENT_BASE_URL}/gift/withdraw`;

export const STARS_GIVEAWAY_PACKAGES = new Set([
  500, 1_000, 1_500, 2_500, 5_000, 10_000, 25_000, 35_000, 50_000,
  100_000, 150_000, 500_000, 1_000_000,
]);

export const DEVICE_FINGERPRINT = JSON.stringify({
  platform: "android",
  appName: "Tonkeeper",
  appVersion: "26.07.1",
  maxProtocolVersion: 2,
  features: [
    "SendTransaction",
    { name: "SignData", types: ["text", "binary", "cell"] },
    { name: "SendTransaction", maxMessages: 255 },
  ],
});

export const BASE_HEADERS: Record<string, string> = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  origin: FRAGMENT_BASE_URL,
  priority: "u=1, i",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "x-requested-with": "XMLHttpRequest",
};

export const EVM_PAYMENT_METHODS = new Set([
  "usdt_eth",
  "usdt_pol",
  "usdc_eth",
  "usdc_base",
  "usdc_pol",
]);

export const EVM_CHAIN_NAMES: Record<number, string> = {
  1: "ETH",
  8453: "BASE",
  137: "POL",
};

export const EVM_TOKEN_DECIMALS: Record<string, number> = {
  "0xdac17f958d2ee523a2206206994597c177e3d24f": 6,
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": 6,
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": 6,
};

export const EVM_TOKEN_SYMBOLS: Record<string, string> = {
  "0xdac17f958d2ee523a2206206994597c177e3d24f": "USDT",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "USDT",
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC",
};

export const VALID_PAYMENT_METHODS = new Set([
  "gram", "ton", "usdt_gram", "usdt_ton",
  "usdt_eth", "usdt_pol", "usdc_eth", "usdc_base", "usdc_pol",
]);

export const BATCH_PAYMENT_METHODS = new Set(["gram", "ton", "usdt_gram", "usdt_ton"]);
export const GRAM_PAYMENT_METHODS = new Set(["gram", "ton", "usdt_gram", "usdt_ton"]);
export const TON_PAYMENT_METHODS = GRAM_PAYMENT_METHODS;

export const PURCHASE_TYPES = new Set(["stars", "premium", "gram", "ton"]);

export const PREMIUM_MONTHS_VALID = new Set([3, 6, 12]);
export const STARS_PURCHASE_MIN = 50;
export const STARS_PURCHASE_MAX = 10_000_000;
export const GRAM_TOPUP_MIN = 1;
export const GRAM_TOPUP_MAX = 1_000_000_000;