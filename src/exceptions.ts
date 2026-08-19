export const MNEMONIC_WORD_COUNTS_VALID = [12, 18, 24] as const;
export const PREMIUM_MONTHS_VALID_VALUES = [3, 6, 12] as const;
export const STARS_PURCHASE_MIN = 50;
export const STARS_PURCHASE_MAX = 10_000_000;
export const GRAM_TOPUP_MIN = 1;
export const GRAM_TOPUP_MAX = 1_000_000_000;
export const STARS_WINNERS_MIN = 1;
export const STARS_WINNERS_MAX = 5;
export const PREMIUM_WINNERS_MIN = 1;
export const PREMIUM_WINNERS_MAX = 24_000;
export const STARS_GIVEAWAY_MIN = 500;
export const STARS_GIVEAWAY_MAX = 1_000_000;

export class FragmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FragmentError";
  }
}

export class ClientError extends FragmentError {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

export class ConfigurationError extends ClientError {
  static MISSING_VARS = "Missing required parameter(s): {keys}.";
  static UNSUPPORTED_VERSION = "Unsupported wallet version '{version}'. Supported values: {supported}.";
  static INVALID_MNEMONIC = `Invalid mnemonic phrase: expected ${MNEMONIC_WORD_COUNTS_VALID.join(", ")} words, got {count}.`;
  static UNSUPPORTED_PROVIDER = "Unsupported API provider '{provider}'. Supported values: {supported}.";
  static UNSUPPORTED_METHOD = "EVM payment methods are not supported for '{item_type}' purchases. Use 'gram' or 'ton' payment method instead.";
  static INVALID_MONTHS = `Invalid Premium duration: choose ${[...PREMIUM_MONTHS_VALID_VALUES].sort().join(", ")} months.`;
  static INVALID_STARS_AMOUNT = `Invalid Stars amount: must be an integer between ${STARS_PURCHASE_MIN.toLocaleString()} and ${STARS_PURCHASE_MAX.toLocaleString()}.`;
  static INVALID_GRAM_AMOUNT = `Invalid GRAM amount: must be an integer between ${GRAM_TOPUP_MIN.toLocaleString()} and ${GRAM_TOPUP_MAX.toLocaleString()}.`;
  static INVALID_TON_AMOUNT = ConfigurationError.INVALID_GRAM_AMOUNT;
  static INVALID_WINNERS_STARS = `Invalid winners count: must be an integer between ${STARS_WINNERS_MIN.toLocaleString()} and ${STARS_WINNERS_MAX.toLocaleString()}.`;
  static INVALID_WINNERS_PREMIUM = `Invalid winners count: must be an integer between ${PREMIUM_WINNERS_MIN.toLocaleString()} and ${PREMIUM_WINNERS_MAX.toLocaleString()}.`;
  static INVALID_STARS_PER_WINNER = `Invalid Stars per winner: must be an integer between ${STARS_GIVEAWAY_MIN.toLocaleString()} and ${STARS_GIVEAWAY_MAX.toLocaleString()}.`;
  static INVALID_PAYMENT_METHOD = "Invalid payment method '{method}'. Supported values: {supported}.";
  static INVALID_GIVEAWAY_PACKAGE = "Invalid Stars giveaway amount: {amount}. Must be one of: {packages}.";
  static INVALID_GIVEAWAY_WINNERS = "Invalid winners count: {winners}. For {amount} stars, winners must be 1 to {max_winners} (total_stars / 100).";
  static SEED_REQUIRED = "This operation requires a wallet seed phrase. Initialize FragmentClient with seed parameter.";
  static TON_TOKEN_REQUIRED = "This operation requires stel_ton_token cookie. Make sure you have connected your TON wallet on fragment.com.";
  static API_KEY_REQUIRED = "This operation requires an API key (Tonconsole or Toncenter). Initialize FragmentClient with apiKey parameter.";

  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export const ConfigError = ConfigurationError;

export class CookieError extends ClientError {
  static READ_FAILED = "Failed to parse cookies: expected a JSON string or a dict, got {exc}.";
  static MISSING_KEYS = "Fragment cookies are missing or empty for key(s): {keys}. Open fragment.com in your browser, log in, and copy fresh cookies.";
  static UNSUPPORTED_BROWSER = "Unsupported browser '{browser}'. Supported values: {supported}.";
  static BROWSER_READ_FAILED = "Failed to read {browser} cookies: {exc}. Make sure {browser} is installed and you are logged in to {url}.";
  static MISSING_BROWSER_KEYS = "Fragment cookies not found in {browser}: {keys}. Make sure you are logged in to {url} and have connected your TON wallet in {browser}.";
  static EXPIRED = "Fragment session cookie expired at {expires}. Log in to fragment.com in your browser and extract fresh cookies.";

  constructor(message: string) {
    super(message);
    this.name = "CookieError";
  }
}

export class FragmentAPIError extends FragmentError {
  static NO_REQUEST_ID = "Fragment did not return a request ID for '{context}'. Your session may have expired. Refresh your cookies and try again.";

  constructor(message: string) {
    super(message);
    this.name = "FragmentAPIError";
  }
}

export class FragmentPageError extends FragmentAPIError {
  static BAD_STATUS = "Fragment returned HTTP {status} when loading {url}. Your cookies may be invalid or expired. Refresh them and try again.";
  static HASH_NOT_FOUND = "Could not extract the API hash from {url}. The page structure may have changed, or you may not be logged in.";
  static ITEM_NOT_FOUND = "Item not found at {url}. Fragment returned HTTP 302 redirect.";

  constructor(message: string) {
    super(message);
    this.name = "FragmentPageError";
  }
}

export class UserNotFoundError extends FragmentAPIError {
  static NOT_FOUND = "Telegram user '{username}' was not found on Fragment. Double-check the username and make sure the account exists.";
  static NOT_A_USER = "'{username}' does not belong to a user account. Make sure the username is assigned to a personal Telegram account, not a channel or bot.";

  constructor(message: string) {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class AlreadySubscribedError extends FragmentAPIError {
  static PREMIUM_ACTIVE = "This account is already subscribed to Telegram Premium.";

  constructor(message: string) {
    super(message);
    this.name = "AlreadySubscribedError";
  }
}

export class AnonymousNumberError extends FragmentAPIError {
  static NOT_OWNED = "Number '{number}' is not associated with your Fragment account or has no active sessions to terminate.";
  static TERMINATE_FAILED = "Failed to terminate sessions for '{number}': {error}";

  constructor(message: string) {
    super(message);
    this.name = "AnonymousNumberError";
  }
}

export class TransactionError extends FragmentAPIError {
  static INVALID_PAYLOAD = "Fragment returned an invalid transaction payload: 'transaction.messages' is missing or empty.";
  static BROADCAST_FAILED = "Transaction broadcast failed: {exc}";
  static BROADCAST_SSL_ERROR = "Transaction broadcast failed due to an SSL certificate error: {exc}";
  static DUPLICATE_SEQNO = "Transaction broadcast failed: the TON wallet rejected the message because a previous transaction with the same sequence number (seqno) is still pending confirmation on-chain. Wait a few seconds for the previous transaction to confirm, then retry.";

  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

export class ConfirmationTimeout extends TransactionError {
  static TIMEOUT = "Transaction confirmation timed out after {seconds}s. The transaction may have been sent — check the blockchain manually. seqno_before={seqno_before}, balance_before={balance_before} GRAM.";

  constructor(message: string) {
    super(message);
    this.name = "ConfirmationTimeout";
  }
}

export class SeqnoError extends TransactionError {
  static FETCH_FAILED = "Failed to fetch wallet seqno: {exc}";
  static STALE = "Seqno did not increment after {seconds}s. Transaction may not have been accepted by the network.";

  constructor(message: string) {
    super(message);
    this.name = "SeqnoError";
  }
}

export class ParseError extends FragmentAPIError {
  static UNPARSEABLE = "Failed to parse the Fragment API response for '{context}': {exc}";

  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export class VerificationError extends FragmentAPIError {
  static KYC_REQUIRED = "Fragment requires identity verification (KYC) before this action can be completed. Complete verification at https://fragment.com/my/profile and retry.";

  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

export class OperationError extends FragmentError {
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}

export class WalletError extends OperationError {
  static LOW_GRAM_BALANCE = "Insufficient GRAM balance: {balance} GRAM available, {required} GRAM required (includes {gas} GRAM gas fee).";
  static LOW_TON_BALANCE = WalletError.LOW_GRAM_BALANCE;
  static LOW_USDT_BALANCE = "Insufficient USDT balance: {balance} USDT available, {required} USDT required.";
  static GRAM_BALANCE_CHECK_FAILED = "Failed to fetch GRAM balance: {exc}";
  static TON_BALANCE_CHECK_FAILED = WalletError.GRAM_BALANCE_CHECK_FAILED;
  static USDT_BALANCE_CHECK_FAILED = "Failed to fetch USDT balance: {exc}";
  static ACCOUNT_INFO_FAILED = "Failed to retrieve wallet account info from TON network: {exc}";
  static WALLET_INFO_FAILED = "Failed to retrieve wallet info from TON network: {exc}";

  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

export class UnexpectedError extends OperationError {
  static UNEXPECTED = "An unexpected error occurred during the operation: {exc}";

  constructor(message: string) {
    super(message);
    this.name = "UnexpectedError";
  }
}

export function fmt(template: string, params: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}