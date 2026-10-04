export type ApiObject = Record<string, unknown>;
export type Cookies = Record<string, string>;
export type WalletVersion = "V4R2" | "V5R1" | "HighloadV2" | "HighloadV3R1";
export type ApiProvider = "tonapi" | "toncenter";
export type PaymentMethod =
  | "ton" | "gram" | "usdt_ton" | "usdt_gram"
  | "usdt_eth" | "usdt_pol" | "usdc_eth" | "usdc_base" | "usdc_pol";
export type NormalizedPaymentMethod = Exclude<PaymentMethod, "gram" | "usdt_gram">;
export type BatchStatus = "prepared" | "broadcast" | "confirmed" | "failed" | "unknown";

export interface SenderAccount {
  address: string;
  chain: "-239";
  publicKey: string;
  walletStateInit: string;
}

export interface PreparedTransactionMessage {
  address: string;
  amount: string;
  payload?: string | null;
  stateInit?: string | null;
}

export interface PreparedTransaction {
  status: "prepared";
  reqId: string;
  itemKind: string;
  target: string;
  amount: number;
  validUntil: number;
  messages: PreparedTransactionMessage[];
  raw: ApiObject;
  senderAddress: string | null;
  confirmReferer: string | null;
  paymentMethod: "ton" | "usdt_ton";
  paymentNanoton: string;
  feeNanoton: string;
  gasReserveNanoton: string;
  requiredNanoton: string;
  requiredUsdtUnits: string | null;
}

export interface TransactionResult {
  txHash: string;
  boc: string | null;
  status: "broadcast" | "confirmed" | "unknown";
  confirmed: boolean;
  seqnoBefore?: number | null;
  seqnoAfter?: number | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  paymentNanoton: string;
  feeNanoton: string;
  confirmationError: string | null;
}

export interface EvmInvoice {
  reqId: string;
  invoiceAddress: string;
  invoiceToken: string;
  invoiceChainId: number;
  invoiceChainName: string;
  invoiceAmountHex: string;
  invoiceAmount: string;
  invoiceAmountRaw: string;
  tokenSymbol: string;
  tokenDecimals: number;
  expiresAt: number;
  paymentMethod: string;
  apiHash: string;
  pageUrl: string;
}

export interface EvmPaymentResult {
  status: "invoice";
  itemKind: string;
  target: string;
  amount: number;
  paymentMethod: string;
  invoice: EvmInvoice;
}

export interface WalletInfo {
  address: string;
  state: string;
  gramBalance: number;
  usdtBalance: number | null;
  balanceNanoton: string;
  balanceTon: number;
  balanceUsdt: number | null;
}

export interface RecipientInfo {
  recipient: string;
  name: string;
  photoUrl: string | null;
  myself: boolean;
}

export interface PurchaseItem {
  type: string;
  username: string;
  amount?: number | null;
  months?: number | null;
  showSender?: boolean;
  show_sender?: boolean;
}

export interface PaymentReceipt {
  transactionId: string;
  confirmed: boolean;
  feeNanoton: string;
  reqId: string | null;
  confirmationError: string | null;
}

export interface PurchaseResult extends PaymentReceipt {
  type: string;
  username: string;
  amount: number;
  paymentMethod: string;
}

export interface PremiumResult extends PurchaseResult {}
export interface StarsResult extends PurchaseResult {}
export interface AdsTopupResult extends PurchaseResult {}

export interface GiveawayStarsResult extends PaymentReceipt {
  channel: string;
  winners: number;
  amount: number;
  paymentMethod: string;
}

export interface GiveawayPremiumResult extends GiveawayStarsResult {}

export interface WithdrawalInitResult {
  ok: boolean;
  confirmMessage: string | null;
  confirmButton: string | null;
  confirmHash: string | null;
  error: string | null;
}

export interface WithdrawalConfirmResult {
  ok: boolean;
  needUpdate: boolean;
  mode: string;
  html: string | null;
  error: string | null;
}

export interface NftWithdrawalInitResult extends WithdrawalInitResult {}
export interface StarsWithdrawalInitResult extends WithdrawalInitResult {}
export interface AdsWithdrawalInitResult extends WithdrawalInitResult {}
export interface NftWithdrawalConfirmResult extends WithdrawalConfirmResult {}
export interface StarsWithdrawalConfirmResult extends WithdrawalConfirmResult {}
export interface AdsWithdrawalConfirmResult extends WithdrawalConfirmResult {}

export interface StarsWithdrawalState {
  transaction: string;
  withdrawalData: string;
}

export interface BidResult extends PaymentReceipt {
  itemType: number;
  slug: string;
  bid: number;
  confirmMethod: string | null;
  confirmId: string | null;
}

export interface OfferResult extends PaymentReceipt {
  itemType: number;
  slug: string;
  amount: number;
}

export interface ListingItem {
  slug: string;
  name: string;
  status: string | null;
  price: string | null;
  date: string | null;
}

export interface UsernamesResult {
  items: ListingItem[];
  nextOffsetId: string | null;
}

export interface NumbersResult extends UsernamesResult {}

export interface GiftsResult {
  items: ListingItem[];
  nextOffset: number | null;
}

export interface BidHistoryEntry {
  price: string | null;
  date: string | null;
  wallet: string | null;
}

export interface OwnerHistoryEntry extends BidHistoryEntry {}
export interface OfferHistoryEntry extends BidHistoryEntry {}

export interface AuctionInfo {
  highestBid?: string | null;
  bidStep?: string | null;
  minimumBid?: string | null;
  sellPrice?: string | null;
  buyNowPrice?: string | null;
}

export interface RateModel {
  gramRate: number;
  tonRate: number;
}

export interface ItemInfo extends RateModel {
  status: string;
  itemType: number;
  auction: AuctionInfo;
  auctionEnd: string | null;
  ownerWallet: string | null;
  purchasedDate: string | null;
  bidHistory: BidHistoryEntry[];
  ownerHistory: OwnerHistoryEntry[];
  offerHistory: OfferHistoryEntry[];
  bidHistoryNextOffset: string | null;
  ownerHistoryNextOffset: string | null;
  offerHistoryNextOffset: string | null;
}

export interface UsernameInfo extends ItemInfo {
  username: string;
}

export interface NumberInfo extends ItemInfo {
  number: string;
  displayNumber: string;
  restricted: boolean;
}

export interface GiftAttribute {
  name: string;
  value: string;
  rarity: string | null;
}

export interface GiftInfo extends ItemInfo {
  slug: string;
  name: string;
  imageUrl: string | null;
  stickerUrl: string | null;
  attributes: GiftAttribute[];
  issued: string | null;
}

export interface GiftCollection {
  slug: string;
  name: string;
  count: number;
  imageUrl: string | null;
}

export interface GiftAttributeValue {
  name: string;
  value: string;
  count: number;
  imageUrl: string | null;
}

export interface GiftAttributeCategory {
  field: string;
  name: string;
  totalCount: number;
  items: GiftAttributeValue[];
}

export interface GiftFiltersInfo {
  collections: GiftCollection[];
  attributes: GiftAttributeCategory[];
}

export interface StarsPrice {
  stars: number;
  gramPrice: string;
  tonPrice: string;
  usdPrice: string;
}

export interface StarsPrices extends RateModel {
  packages: StarsPrice[];
}

export interface PremiumPriceOption {
  months: number;
  label: string;
  gramPrice: string;
  tonPrice: string;
  usdPrice: string;
  discount: string | null;
}

export interface PremiumPrices extends RateModel {
  options: PremiumPriceOption[];
}

export interface StarsTransaction {
  recipient: string;
  stars: number;
  priceGram: string;
  priceTon: string;
  date: string;
}

export interface PremiumTransaction {
  recipient: string;
  duration: string;
  priceGram: string;
  priceTon: string;
  date: string;
}

export interface TopupTransaction {
  recipient: string;
  amount: number;
  date: string;
}

export interface ProfileInfo {
  name: string;
  username: string;
  photoUrl: string | null;
  identityVerified: boolean;
  walletAddress: string | null;
  walletLabel: string | null;
  walletVerified: boolean;
}

export interface SessionInfo {
  sessionId: string;
  device: string;
  location: string;
  date: string | null;
  isCurrent: boolean;
}

export interface MyBid {
  itemType: string;
  slug: string;
  name: string;
  bid: number;
  status: string;
  date: string;
  imageUrl: string | null;
  description: string | null;
}

export interface MyBidsResult extends RateModel {
  items: MyBid[];
  totalCount: number;
}

export interface MyAsset {
  itemType: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  assignedTo: string | null;
  assignedName: string | null;
}

export interface MyAssetsResult extends RateModel {
  items: MyAsset[];
  totalCount: number;
}

export interface TelegramAccount {
  id: string;
  name: string;
  type: string;
  photoUrl: string | null;
}

export interface AssignAccountsResult {
  accounts: TelegramAccount[];
  canDisable: boolean;
}

export interface AssignResult {
  ok: boolean;
  message: string | null;
  needPay: boolean;
  reqId: string | null;
  amount: string | null;
  assignName: string | null;
}

export interface StartAuctionResult {
  ok: boolean;
  reqId: string | null;
  transactionId: string | null;
  confirmed: boolean;
}

export interface NftTransferRecipient extends RecipientInfo {}

export interface NftTransferRequest {
  reqId: string;
  myself: boolean;
  itemTitle: string;
  content: string;
  button: string;
}

export interface LoginCodeResult {
  number: string;
  code: string | null;
  activeSessions: number;
}

export interface TerminateSessionsResult {
  number: string;
  message: string | null;
}

export interface BatchItemResult {
  type: string;
  username: string;
  amount: number;
  ok: boolean;
  result: PurchaseResult | PreparedTransaction | null;
  error: string | null;
  chunkIndex: number;
  status: BatchStatus;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  chunksSent: number;
  items: BatchItemResult[];
  preparedTransactions: PreparedTransaction[];
}

export interface NoKycBatchResult extends BatchResult {}

export interface GatewayPriceInfo {
  credits: number;
  gramPrice: string;
  usdPrice: string | null;
}

export interface GatewayRechargeResult extends PaymentReceipt {
  accountId: string;
  credits: number;
}

export interface AdsRechargeResult extends PaymentReceipt {
  accountId: string;
  amount: number;
}

export interface SubscriptionResult {
  ok: boolean;
  subscribed: boolean;
  itemType: number;
  slug: string;
}

export type PurchaseOutcome =
  PurchaseResult | PreparedTransaction | EvmPaymentResult;

export type GiveawayOutcome =
  GiveawayStarsResult | PreparedTransaction | EvmPaymentResult;