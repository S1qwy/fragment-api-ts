export interface PreparedTransactionMessage {
  address: string;
  amount: string;
  payload?: string | null;
  stateInit?: string | null;
}

export interface PreparedTransaction {
  reqId: string;
  itemKind: string;
  target: string;
  amount: number;
  validUntil: number;
  messages: PreparedTransactionMessage[];
  raw: Record<string, any>;
  senderAddress?: string | null;
  confirmReferer?: string | null;
}

export interface EvmInvoice {
  reqId: string;
  invoiceAddress: string;
  invoiceToken: string;
  invoiceChainId: number;
  invoiceChainName: string;
  invoiceAmountHex: string;
  invoiceAmount: number;
  invoiceAmountRaw: number;
  tokenSymbol: string;
  tokenDecimals: number;
  expiresAt: number;
  paymentMethod: string;
  apiHash: string;
  pageUrl: string;
}

export interface EvmPaymentResult {
  itemKind: string;
  target: string;
  amount: number;
  paymentMethod: string;
  invoice: EvmInvoice;
}

export interface TransactionResult {
  txHash: string;
  boc?: string | null;
  seqnoBefore?: number | null;
  seqnoAfter?: number | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  confirmed: boolean;
}

export interface WalletInfo {
  address: string;
  state: string;
  gramBalance: number;
  usdtBalance: number;
}

export interface RecipientInfo {
  recipient: string;
  name: string;
  photoUrl?: string | null;
  myself: boolean;
}

export interface PurchaseItem {
  type: string;
  username: string;
  amount?: number | null;
  months?: number | null;
  showSender?: boolean;
}

export interface PurchaseResult {
  transactionId: string;
  type: string;
  username: string;
  amount: number;
  paymentMethod: string;
}

export interface PremiumResult {
  transactionId: string;
  username: string;
  amount: number;
  paymentMethod: string;
}

export interface StarsResult {
  transactionId: string;
  username: string;
  amount: number;
  paymentMethod: string;
}

export interface AdsTopupResult {
  transactionId: string;
  username: string;
  amount: number;
}

export interface GiveawayStarsResult {
  transactionId: string;
  channel: string;
  winners: number;
  amount: number;
  paymentMethod: string;
}

export interface GiveawayPremiumResult {
  transactionId: string;
  channel: string;
  winners: number;
  amount: number;
  paymentMethod: string;
}

export interface NftWithdrawalInitResult {
  ok: boolean;
  confirmMessage?: string | null;
  confirmButton?: string | null;
  confirmHash?: string | null;
  error?: string | null;
}

export interface NftWithdrawalConfirmResult {
  ok: boolean;
  needUpdate: boolean;
  mode: string;
  html?: string | null;
  error?: string | null;
}

export interface StarsWithdrawalState {
  transaction: string;
  withdrawalData: string;
}

export interface StarsWithdrawalInitResult {
  ok: boolean;
  confirmMessage?: string | null;
  confirmButton?: string | null;
  confirmHash?: string | null;
  error?: string | null;
}

export interface StarsWithdrawalConfirmResult {
  ok: boolean;
  needUpdate: boolean;
  mode: string;
  html?: string | null;
  error?: string | null;
}

export interface BidResult {
  transactionId: string;
  itemType: number;
  slug: string;
  bid: number;
  confirmMethod?: string | null;
  confirmId?: string | null;
}

export interface UsernamesResult {
  items: Record<string, any>[];
  nextOffsetId: string | null;
}

export interface NumbersResult {
  items: Record<string, any>[];
  nextOffsetId: string | null;
}

export interface GiftsResult {
  items: Record<string, any>[];
  nextOffset: number | null;
}

export interface BidHistoryEntry {
  price: string | null;
  date: string | null;
  wallet: string | null;
}

export interface OwnerHistoryEntry {
  price: string | null;
  date: string | null;
  wallet: string | null;
}

export interface OfferHistoryEntry {
  price: string | null;
  date: string | null;
  wallet: string | null;
}

export interface AuctionInfo {
  highestBid?: string | null;
  bidStep?: string | null;
  minimumBid?: string | null;
  sellPrice?: string | null;
  buyNowPrice?: string | null;
}

export interface UsernameInfo {
  username: string;
  status: string;
  itemType: number;
  gramRate: number;
  auction?: AuctionInfo | null;
  auctionEnd?: string | null;
  ownerWallet?: string | null;
  purchasedDate?: string | null;
  bidHistory: BidHistoryEntry[];
  ownerHistory: OwnerHistoryEntry[];
  offerHistory: OfferHistoryEntry[];
  bidHistoryNextOffset?: string | null;
  ownerHistoryNextOffset?: string | null;
  offerHistoryNextOffset?: string | null;
}

export interface NumberInfo {
  number: string;
  displayNumber: string;
  status: string;
  itemType: number;
  gramRate: number;
  restricted: boolean;
  auction?: AuctionInfo | null;
  auctionEnd?: string | null;
  ownerWallet?: string | null;
  purchasedDate?: string | null;
  bidHistory: BidHistoryEntry[];
  ownerHistory: OwnerHistoryEntry[];
  offerHistory: OfferHistoryEntry[];
  bidHistoryNextOffset?: string | null;
  ownerHistoryNextOffset?: string | null;
  offerHistoryNextOffset?: string | null;
}

export interface GiftInfo {
  slug: string;
  name: string;
  status: string;
  itemType: number;
  gramRate: number;
  imageUrl?: string | null;
  stickerUrl?: string | null;
  ownerWallet?: string | null;
  purchasedDate?: string | null;
  auction?: AuctionInfo | null;
  auctionEnd?: string | null;
  attributes: GiftAttribute[];
  issued?: string | null;
  bidHistory: BidHistoryEntry[];
  ownerHistory: OwnerHistoryEntry[];
  offerHistory: OfferHistoryEntry[];
  bidHistoryNextOffset?: string | null;
  ownerHistoryNextOffset?: string | null;
  offerHistoryNextOffset?: string | null;
}

export interface GiftAttribute {
  name: string;
  value: string;
  rarity?: string | null;
}

export interface StarsPrice {
  stars: number;
  gramPrice: string;
  usdPrice: string;
}

export interface StarsPrices {
  packages: StarsPrice[];
  gramRate: number;
}

export interface PremiumPriceOption {
  months: number;
  label: string;
  gramPrice: string;
  usdPrice: string;
  discount?: string | null;
}

export interface PremiumPrices {
  options: PremiumPriceOption[];
  gramRate: number;
}

export interface StarsTransaction {
  recipient: string;
  stars: number;
  priceGram: string;
  date: string;
}

export interface PremiumTransaction {
  recipient: string;
  duration: string;
  priceGram: string;
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
  imageUrl?: string | null;
  description?: string | null;
}

export interface MyBidsResult {
  items: MyBid[];
  gramRate: number;
  totalCount: number;
}

export interface MyAsset {
  itemType: string;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  assignedTo?: string | null;
  assignedName?: string | null;
}

export interface MyAssetsResult {
  items: MyAsset[];
  gramRate: number;
  totalCount: number;
}

export interface TelegramAccount {
  id: string;
  name: string;
  type: string;
  photoUrl?: string | null;
}

export interface AssignAccountsResult {
  accounts: TelegramAccount[];
  canDisable: boolean;
}

export interface AssignResult {
  ok: boolean;
  message?: string | null;
  needPay?: boolean;
  reqId?: string | null;
  amount?: string | null;
  assignName?: string | null;
}

export interface StartAuctionResult {
  ok: boolean;
  reqId?: string | null;
}

export interface NftTransferRecipient {
  myself: boolean;
  recipient: string;
  name: string;
  photoUrl?: string | null;
}

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
  result?: any;
  error?: string | null;
  chunkIndex: number;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  chunksSent: number;
  items: BatchItemResult[];
}

export interface OfferResult {
  transactionId: string;
  itemType: number;
  slug: string;
  amount: number;
  reqId?: string | null;
}

export interface SubscriptionResult {
  ok: boolean;
  subscribed: boolean;
  itemType: number;
  slug: string;
}

export interface AdsWithdrawalInitResult {
  ok: boolean;
  confirmMessage?: string | null;
  confirmButton?: string | null;
  confirmHash?: string | null;
  error?: string | null;
}

export interface AdsWithdrawalConfirmResult {
  ok: boolean;
  needUpdate?: boolean;
  mode?: string;
  html?: string | null;
  error?: string | null;
}

export interface GatewayPriceInfo {
  credits: number;
  gramPrice: string;
  usdPrice?: string | null;
}

export interface GatewayRechargeResult {
  transactionId: string;
  accountId: string;
  credits: number;
  reqId?: string | null;
}