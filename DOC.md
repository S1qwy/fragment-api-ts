Понял, держи полную, подробную документацию без каких-либо сокращений — со всеми таблицами параметров к каждому методу, всеми интерфейсами, полями, исключениями и примерами.

---

# Fragment API TypeScript SDK — Full Documentation

Complete reference for **fragment-api-ts v1.0.0**.

---

## Table of Contents

- [Installation & Requirements](#installation--requirements)
- [Operating Modes](#operating-modes)
- [Client Configuration](#client-configuration)
  - [FragmentClient Constructor](#fragmentclient-constructor)
  - [Cookie Formats](#cookie-formats)
  - [Getters / Properties](#getters--properties)
- [Authentication](#authentication)
- [Payment Methods](#payment-methods)
- [API Methods](#api-methods)
  - [Wallet](#wallet)
  - [Purchases & Top-ups](#purchases--top-ups)
  - [Batch Purchases](#batch-purchases)
  - [Giveaways](#giveaways)
  - [Recipient Search](#recipient-search)
  - [Marketplace Search](#marketplace-search)
  - [Asset Information](#asset-information)
  - [Price Queries](#price-queries)
  - [Transaction History](#transaction-history)
  - [My Assets & Bids](#my-assets--bids)
  - [Assignment](#assignment)
  - [Auction & Selling](#auction--selling)
  - [NFT Transfers](#nft-transfers)
  - [NFT Withdrawals](#nft-withdrawals)
  - [Stars Withdrawals](#stars-withdrawals)
  - [Anonymous Numbers (+888)](#anonymous-numbers-888)
  - [Sessions](#sessions)
  - [Low-Level / Advanced](#low-level--advanced)
- [Data Types & Interfaces](#data-types--interfaces)
  - [Purchase & Transaction Results](#purchase--transaction-results)
  - [EVM Payment Types](#evm-payment-types)
  - [Marketplace Item Info](#marketplace-item-info)
  - [Marketplace Search Results](#marketplace-search-results)
  - [Price Models](#price-models)
  - [History Models](#history-models)
  - [Account & Profile Models](#account--profile-models)
  - [Asset Management Models](#asset-management-models)
  - [NFT & Withdrawal Models](#nft--withdrawal-models)
  - [Anonymous Number Models](#anonymous-number-models)
  - [Batch Models](#batch-models)
  - [Auction Models](#auction-models)
  - [Helper Models](#helper-models)
- [Exceptions](#exceptions)
  - [Hierarchy](#exception-hierarchy)
  - [Base Exceptions](#base-exceptions)
  - [Client Exceptions](#client-exceptions)
  - [API Exceptions](#api-exceptions)
  - [Operation Exceptions](#operation-exceptions)
- [Constants & Limits](#constants--limits)
- [Examples](#examples)
  - [Full Mode — Purchase Stars](#full-mode--purchase-stars)
  - [Batch Purchase](#batch-purchase-example)
  - [EVM Payment Flow](#evm-payment-flow)
  - [Search Marketplace](#search-marketplace)
  - [Anonymous Number Management](#anonymous-number-management)
  - [NFT Transfer](#nft-transfer-example)
  - [Auto Authentication](#auto-authentication-example)
- [Support & License](#support--license)

---

## Installation & Requirements

```bash
npm install fragment-api-ts
```
*Or using yarn / pnpm:*
```bash
yarn add fragment-api-ts
# pnpm add fragment-api-ts
```

| Requirement | Details |
|---|---|
| Node.js | 18.0.0 or higher |
| TON wallet seed phrase | 12, 18, or 24 words |
| Fragment cookies | `stel_ssid`, `stel_dt`, `stel_token` (minimum); `stel_ton_token` (for wallet operations) |
| API key | Tonconsole or Toncenter key (required for wallet/transaction operations) |

Get a free Tonconsole API key at [tonconsole.com](https://tonconsole.com/).

---

## Operating Modes

The library supports three operating modes depending on which parameters you provide:

| Mode | Required Parameters | Available Operations |
|---|---|---|
| **Full mode** | `cookies` (with `stel_ton_token`) + `seed` + `apiKey` | All operations: purchases, giveaways, bids, wallet, NFT, withdrawals |
| **EVM-only mode** | `cookies` (without `stel_ton_token`) | EVM payment methods, read-only search/info methods |
| **Read-only mode** | `cookies` only (no `seed`) | Search, item info, price queries |

---

## Client Configuration

### FragmentClient Constructor

```typescript
new FragmentClient(params: {
  cookies: Record<string, string> | string;
  seed?: string | null;
  apiKey?: string | null;
  apiProvider?: string;
  walletVersion?: string;
  timeout?: number;
})
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `cookies` | `Record<string, string> \| string` | **(required)** | Fragment session cookies. Accepts an object, a JSON string, or a semicolon-separated cookie string (e.g. `"stel_ssid=abc; stel_dt=-180; stel_token=xyz"`). |
| `seed` | `string \| null` | `null` | TON wallet mnemonic phrase (12, 18, or 24 words separated by spaces). Required for any on-chain transaction. |
| `apiKey` | `string \| null` | `null` | API key for TON blockchain interactions. Required alongside `seed` for wallet operations. |
| `apiProvider` | `string` | `"tonapi"` | Blockchain API provider. Accepted values: `"tonapi"`, `"toncenter"`. |
| `walletVersion` | `string` | `"V5R1"` | TON wallet contract version. Accepted values: `"V4R2"`, `"V5R1"`. V5R1 supports up to 255 messages per transaction; V4R2 supports up to 4. |
| `timeout` | `number` | `30000` | HTTP request timeout in milliseconds for all Fragment API calls. |

### Cookie Formats

The `cookies` parameter accepts three formats:

**Object:**
```typescript
const cookies = {
  stel_ssid: "abc123",
  stel_dt: "-180",
  stel_token: "xyz789",
  stel_ton_token: "tok456"
};
```

**JSON string:**
```typescript
const cookies = '{"stel_ssid": "abc123", "stel_dt": "-180", "stel_token": "xyz789"}';
```

**Cookie header string:**
```typescript
const cookies = "stel_ssid=abc123; stel_dt=-180; stel_token=xyz789; stel_ton_token=tok456";
```

**Required cookie keys:**

| Key | Required | Description |
|---|---|---|
| `stel_ssid` | Always | Session identifier |
| `stel_dt` | Always | Device timezone offset |
| `stel_token` | Always | Authentication token |
| `stel_ton_token` | For wallet/write ops | TON wallet connection token. Set after connecting a TON wallet on fragment.com |

### Getters / Properties

| Property | Type | Description |
|---|---|---|
| `client.hasWallet` | `boolean` | `true` if both `seed` and `apiKey` are configured. |
| `client.hasTonToken` | `boolean` | `true` if `stel_ton_token` cookie is present and non-empty. |

---

## Authentication

### `FragmentClient.authenticate()` (static)

Performs full Fragment authentication using TON wallet proof and optionally Telegram OAuth. Returns session cookies that can be used to construct a `FragmentClient`.

```typescript
const cookies = await FragmentClient.authenticate({
  seed: "word1 word2 ... word24",
  walletVersion: "V5R1",
  phone: "+71234567890",
  printQr: true,
  onStatus: (status, payload) => console.log(status, payload),
  timeout: 30000,
});
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `seed` | `string` | **(required)** | TON wallet mnemonic phrase. |
| `walletVersion` | `string` | `"V5R1"` | Wallet contract version (`"V4R2"` or `"V5R1"`). |
| `phone` | `string \| undefined` | `undefined` | If provided, uses phone-confirmation flow instead of QR code. Include country code (e.g. `"+71234567890"`). |
| `printQr` | `boolean` | `true` | If `true` and `phone` is omitted, prints a QR code to the terminal for Telegram scanning. |
| `onStatus` | `(status: string, payload: any) => void` | `undefined` | Optional callback called during auth flow. Statuses: `"qr_link"`, `"refresh"`, `"consumed"`, `"confirmed"`, `"phone_sent"`. |
| `timeout` | `number` | `30000` | HTTP timeout in milliseconds. |

**Returns:** `Promise<Record<string, string>>` — Session cookies object.

**Auth flow:**
1. Loads Fragment homepage and extracts TON proof challenge.
2. Signs the challenge with the wallet private key.
3. Sends `checkTonProofAuth` to Fragment API.
4. If `stel_token` is already set, returns cookies immediately.
5. Otherwise, initiates Telegram OAuth (QR or phone).
6. Polls until user confirms, then finalizes login.

---

## Payment Methods

| Method String | Chain | Token | Behavior |
|---|---|---|---|
| `"gram"` | TON (Gram) | GRAM | Automatic on-chain transaction. Alias for `"ton"`. |
| `"ton"` | TON (Gram) | GRAM | Automatic on-chain transaction. Internal API value. |
| `"usdt_gram"` | TON (Gram) | USDT | Automatic on-chain USDT transfer. Alias for `"usdt_ton"`. |
| `"usdt_ton"` | TON (Gram) | USDT | Automatic on-chain USDT transfer. Internal API value. |
| `"usdt_eth"` | Ethereum | USDT | Returns `EvmPaymentResult` with invoice details. |
| `"usdt_pol"` | Polygon | USDT | Returns `EvmPaymentResult` with invoice details. |
| `"usdc_eth"` | Ethereum | USDC | Returns `EvmPaymentResult` with invoice details. |
| `"usdc_base"` | BASE | USDC | Returns `EvmPaymentResult` with invoice details. |
| `"usdc_pol"` | Polygon | USDC | Returns `EvmPaymentResult` with invoice details. |

**Notes:**
- `"gram"` and `"ton"` are interchangeable; `"usdt_gram"` and `"usdt_ton"` are interchangeable.
- GRAM on-chain methods (`gram`, `ton`, `usdt_gram`, `usdt_ton`) require `seed` + `apiKey`.
- EVM methods return an `EvmPaymentResult` containing an `EvmInvoice` that you must fulfill externally.
- Batch purchases only support GRAM methods (`gram`, `ton`, `usdt_gram`, `usdt_ton`).
- Ads top-up only supports GRAM methods.

---

## API Methods

### Wallet

#### `client.getWallet(): Promise<WalletInfo>`

Returns address, state, GRAM balance, and USDT balance of the configured wallet.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

```typescript
const wallet = await client.getWallet();
console.log(wallet.address);     // "UQ..."
console.log(wallet.state);       // "active"
console.log(wallet.gramBalance); // 12.5432
console.log(wallet.usdtBalance); // 100.0
```

---

### Purchases & Top-ups

#### `client.purchase(itemsOrType, username?, amount?, months?, showSender?, paymentMethod?): Promise<PurchaseResult | BatchResult | EvmPaymentResult>`

Unified purchase method supporting both single and batch operations.

**Single purchase (type string):**
```typescript
const result = await client.purchase("stars", "durov", 100);
```

**Single purchase (object):**
```typescript
const result = await client.purchase({ type: "stars", username: "durov", amount: 100 });
```

**Single purchase (PurchaseItem):**
```typescript
import { PurchaseItem } from "fragment-api-ts";
const item: PurchaseItem = { type: "stars", username: "durov", amount: 100 };
const result = await client.purchase(item);
```

**Batch purchase (array):**
```typescript
const result = await client.purchase([
  { type: "stars", username: "durov", amount: 100 },
  { type: "premium", username: "telegram", months: 3 },
]);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemsOrType` | `Array<Record<string, any> \| PurchaseItem> \| Record<string, any> \| PurchaseItem \| string` | **(required)** | Array of items for batch, single item object/PurchaseItem, or type string (`"stars"`, `"premium"`, `"gram"`, `"ton"`). |
| `username` | `string \| null \| undefined` | `undefined` | Telegram username (when `itemsOrType` is a string). |
| `amount` | `number \| null \| undefined` | `undefined` | Stars quantity (50–10,000,000) or GRAM amount (1–1,000,000,000). |
| `months` | `number \| null \| undefined` | `undefined` | Premium duration: `3`, `6`, or `12`. |
| `showSender` | `boolean` | `true` | Whether to show sender name in Telegram notification. |
| `paymentMethod` | `string` | `"gram"` | Payment method string. See [Payment Methods](#payment-methods). |

**Returns:**
- `PurchaseResult` — For single GRAM on-chain purchases.
- `EvmPaymentResult` — For single EVM purchases.
- `BatchResult` — For array inputs.

---

#### `client.purchaseStars(username, amount, showSender?, paymentMethod?): Promise<PurchaseResult | EvmPaymentResult>`

Send Telegram Stars to a user. Convenience wrapper around `purchase()`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `username` | `string` | **(required)** | Telegram username of the recipient. |
| `amount` | `number` | **(required)** | Number of Stars to send. Range: 50–10,000,000. |
| `showSender` | `boolean` | `true` | Show sender name in notification. |
| `paymentMethod` | `string` | `"gram"` | Payment method. |

---

#### `client.purchasePremium(username, months, showSender?, paymentMethod?): Promise<PurchaseResult | EvmPaymentResult>`

Gift Telegram Premium to a user.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `username` | `string` | **(required)** | Telegram username of the recipient. |
| `months` | `number` | **(required)** | Premium duration. Accepted values: `3`, `6`, `12`. |
| `showSender` | `boolean` | `true` | Show sender name in notification. |
| `paymentMethod` | `string` | `"gram"` | Payment method. |

**Raises:** `AlreadySubscribedError` if the user already has active Premium.

---

#### `client.topupGram(username, amount, showSender?): Promise<PurchaseResult>`

Top up GRAM to a recipient's Telegram Ads balance.

**Requires:** `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `username` | `string` | **(required)** | Telegram Ads account username. |
| `amount` | `number` | **(required)** | GRAM amount. Range: 1–1,000,000,000. |
| `showSender` | `boolean` | `true` | Show sender name. |

**Note:** Only GRAM payment method is supported for ads top-ups.

---

#### `client.topupTon(username, amount, showSender?): Promise<PurchaseResult>`

Alias for `topupGram()`. Backward-compatible.

---

### Batch Purchases

#### `client.batchPurchase(items, paymentMethod?): Promise<BatchResult>`

Execute multiple purchases as batched on-chain TON transactions. Messages are automatically chunked based on wallet version limits (V4R2: 4 messages, V5R1: 255 messages per transaction).

| Parameter | Type | Default | Description |
|---|---|---|---|
| `items` | `Array<Record<string, any> \| PurchaseItem>` | **(required)** | Array of purchase items. Each item must contain `type`, `username`, and either `amount` or `months`. |
| `paymentMethod` | `string` | `"gram"` | Only GRAM methods supported: `"gram"`, `"ton"`, `"usdt_gram"`, `"usdt_ton"`. |

**Item object format:**
```typescript
{ type: "stars", username: "durov", amount: 100 }
{ type: "premium", username: "telegram", months: 3 }
{ type: "gram", username: "adschannel", amount: 50 }
```

**Returns:** `BatchResult` with per-item results and chunk statistics.

**Behavior:**
1. Validates all items upfront.
2. Resolves recipients and initializes requests for each item.
3. Collects all transaction messages.
4. Checks total GRAM balance (including gas).
5. Chunks messages by wallet version limit.
6. Broadcasts each chunk as a single on-chain transaction.
7. Confirms each request with Fragment.

---

### Giveaways

#### `client.giveawayStars(channel, winners, amount, paymentMethod?): Promise<GiveawayStarsResult | EvmPaymentResult>`

Run a Telegram Stars giveaway for a channel.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `channel` | `string` | **(required)** | Channel username. |
| `winners` | `number` | **(required)** | Number of winners. Range: 1 to `Math.min(Math.floor(amount / 100), 10000)`. |
| `amount` | `number` | **(required)** | Total Stars amount. Must be one of the allowed packages: 500, 1000, 1500, 2500, 5000, 10000, 25000, 35000, 50000, 100000, 150000, 500000, 1000000. |
| `paymentMethod` | `string` | `"gram"` | Payment method. |

---

#### `client.giveawayPremium(channel, winners, months?, paymentMethod?): Promise<GiveawayPremiumResult | EvmPaymentResult>`

Run a Telegram Premium giveaway for a channel.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `channel` | `string` | **(required)** | Channel username. |
| `winners` | `number` | **(required)** | Number of winners. Range: 1–24,000. |
| `months` | `number` | `3` | Premium duration: `3`, `6`, or `12`. |
| `paymentMethod` | `string` | `"gram"` | Payment method. |

---

### Recipient Search

These methods resolve a Telegram username to a Fragment-internal recipient ID. Return `null` if not found.

#### `client.getStarsRecipient(username): Promise<RecipientInfo | null>`

| Parameter | Type | Description |
|---|---|---|
| `username` | `string` | Telegram username to search. |

#### `client.getPremiumRecipient(username, months?): Promise<RecipientInfo | null>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `username` | `string` | **(required)** | Telegram username. |
| `months` | `number` | `3` | Premium duration for price context. |

#### `client.getAdsTopupRecipient(username): Promise<RecipientInfo | null>`

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `username` | `string` | Telegram Ads account username. |

#### `client.getGiveawayStarsRecipient(channel, winners?, amount?): Promise<RecipientInfo | null>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `channel` | `string` | **(required)** | Channel username. |
| `winners` | `number` | `1` | Number of winners. |
| `amount` | `number` | `500` | Stars amount. |

#### `client.getGiveawayPremiumRecipient(channel, winners?, months?): Promise<RecipientInfo | null>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `channel` | `string` | **(required)** | Channel username. |
| `winners` | `number` | `1` | Number of winners. |
| `months` | `number` | `3` | Premium months. |

---

### Marketplace Search

#### `client.searchUsernames(query?, sort?, filter?, offsetId?): Promise<UsernamesResult>`

Search Fragment marketplace for Telegram usernames.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | `string` | `""` | Search text. Empty string browses all. |
| `sort` | `string \| null` | `null` | Sort order: `"price_desc"`, `"price_asc"`, `"listed"`, `"ending"`. |
| `filter` | `string \| null` | `null` | Status filter: `"auction"`, `"sale"`, `"sold"`, or `""` (available). |
| `offsetId` | `string \| null` | `null` | Pagination cursor from previous `UsernamesResult.nextOffsetId`. |

---

#### `client.searchNumbers(query?, sort?, filter?, offsetId?): Promise<NumbersResult>`

Search Fragment marketplace for anonymous Telegram numbers. Same parameters as `searchUsernames`.

---

#### `client.searchGifts(query?, collection?, sort?, filter?, view?, attr?, offset?): Promise<GiftsResult>`

Search Fragment gifts marketplace.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | `string` | `""` | Search text. |
| `collection` | `string \| null` | `null` | Gift collection slug filter. |
| `sort` | `string \| null` | `null` | Sort order. |
| `filter` | `string \| null` | `null` | Status filter. |
| `view` | `string \| null` | `null` | Active attribute tab name. |
| `attr` | `Record<string, string[]> \| null` | `null` | Attribute filter. Maps trait names to lists of accepted values. Example: `{"Background": ["Red", "Blue"]}`. |
| `offset` | `number \| null` | `null` | Page offset from previous `GiftsResult.nextOffset`. |

---

### Asset Information

#### `client.getUsernameInfo(username): Promise<UsernameInfo>`

Get detailed information about a Fragment username.

| Parameter | Type | Description |
|---|---|---|
| `username` | `string` | Username to look up (with or without `@`). |

---

#### `client.getNumberInfo(number): Promise<NumberInfo>`

Get detailed information about a Fragment anonymous number.

| Parameter | Type | Description |
|---|---|---|
| `number` | `string` | Phone number (with or without `+`, spaces, dashes). |

---

#### `client.getGiftInfo(slug): Promise<GiftInfo>`

Get detailed information about a Fragment gift.

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Gift identifier on Fragment. |

---

### Price Queries

#### `client.getStarsPrices(): Promise<StarsPrices>`

Get all available Telegram Stars package prices. Returns packages with GRAM and USD prices.

#### `client.getStarsPrice(quantity): Promise<StarsPrice>`

Get price for a specific Stars quantity.

| Parameter | Type | Description |
|---|---|---|
| `quantity` | `number` | Number of Stars. |

#### `client.getPremiumPrices(): Promise<PremiumPrices>`

Get Telegram Premium subscription prices for all durations (3, 6, 12 months).

---

### Transaction History

All history methods require `stel_ton_token`.

#### `client.getStarsHistory(sort?): Promise<StarsTransaction[]>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `sort` | `string` | `"desc"` | Sort order: `"desc"` (newest first) or `"asc"` (oldest first). |

#### `client.getPremiumHistory(sort?): Promise<PremiumTransaction[]>`

Same parameter as above.

#### `client.getTopupHistory(sort?): Promise<TopupTransaction[]>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `sort` | `string` | `"asc"` | Sort order. |

#### `client.getOrdersHistory(itemType, username, offsetId): Promise<Record<string, any>>`

Load more bid/order history for an item (paginated).

| Parameter | Type | Description |
|---|---|---|
| `itemType` | `number` | `1` (username), `3` (number), `5` (gift). |
| `username` | `string` | Item identifier. |
| `offsetId` | `string` | Pagination cursor. |

#### `client.getOwnersHistory(itemType, username, offsetId): Promise<Record<string, any>>`

Load more ownership history for an item (paginated). Same parameters as `getOrdersHistory`.

---

### My Assets & Bids

Both methods require `stel_ton_token`.

#### `client.getMyAssets(itemType?): Promise<MyAssetsResult>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemType` | `string` | `"usernames"` | Asset type: `"usernames"`, `"numbers"`, or `"gifts"`. |

#### `client.getMyBids(itemType?, sort?): Promise<MyBidsResult>`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemType` | `string` | `"usernames"` | Asset type: `"usernames"`, `"numbers"`, or `"gifts"`. |
| `sort` | `string` | `"desc"` | Sort order. |

---

### Assignment

#### `client.getAssignAccounts(itemType, slug): Promise<AssignAccountsResult>`

Get list of Telegram accounts available for asset assignment.

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `itemType` | `number` | `1` (username) or `5` (gift). |
| `slug` | `string` | Item identifier. |

#### `client.assignToTelegram(itemType, slug, assignTo?): Promise<AssignResult>`

Assign an owned username or gift to a Telegram account.

**Requires:** `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemType` | `number` | **(required)** | `1` (username) or `5` (gift). |
| `slug` | `string` | **(required)** | Item identifier. |
| `assignTo` | `string \| null` | `null` | Target Telegram account ID from `getAssignAccounts()`. If `null`, assigns to default account. |

---

### Auction & Selling

#### `client.placeBid(itemType, slug, bid): Promise<BidResult>`

Place a bid or buy-now on a Fragment marketplace item.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `itemType` | `number` | `1` (username), `3` (number), or `5` (gift). |
| `slug` | `string` | Item identifier on Fragment. |
| `bid` | `number` | Bid amount in GRAM (integer). If equal to buy-now price, executes instant purchase. |

#### `client.startAuction(itemType, slug, minAmount, maxAmount?): Promise<StartAuctionResult>`

Start an auction for an owned username or gift.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `itemType` | `number` | **(required)** | `1` (username) or `5` (gift). |
| `slug` | `string` | **(required)** | Item identifier. |
| `minAmount` | `number` | **(required)** | Minimum bid / starting price in GRAM. |
| `maxAmount` | `number` | `0` | If `0`, runs as auction. If equal to `minAmount`, sets a fixed sell price. |

#### `client.sellAsset(itemType, slug, price): Promise<StartAuctionResult>`

Sell an owned username or gift at a fixed price. Convenience wrapper: calls `startAuction(itemType, slug, price, price)`.

| Parameter | Type | Description |
|---|---|---|
| `itemType` | `number` | `1` (username) or `5` (gift). |
| `slug` | `string` | Item identifier. |
| `price` | `number` | Fixed sell price in GRAM. |

---

### NFT Transfers

#### `client.searchNftTransferRecipient(query): Promise<NftTransferRecipient | null>`

Search for a recipient to transfer an NFT gift to.

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `query` | `string` | Telegram username or search query. |

#### `client.initNftTransfer(slug, recipient): Promise<NftTransferRequest>`

Initialize an NFT transfer request.

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `slug` | `string` | Gift slug identifier. |
| `recipient` | `string` | Fragment recipient ID from `searchNftTransferRecipient()`. |

#### `client.transferNft(reqId, showSender?): Promise<TransactionResult>`

Execute the NFT transfer on-chain.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `reqId` | `string` | **(required)** | Request ID from `initNftTransfer()`. |
| `showSender` | `boolean` | `true` | Show sender name. |

---

### NFT Withdrawals

#### `client.getNftWithdrawalState(transaction): Promise<Record<string, any>>`

Get NFT withdrawal state from Fragment page.

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `transaction` | `string` | Transaction identifier from Fragment. |

#### `client.initNftWithdrawal(transaction, keepGift?): Promise<NftWithdrawalInitResult>`

Initialize NFT withdrawal to your wallet.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `transaction` | `string` | **(required)** | Transaction identifier. |
| `keepGift` | `boolean` | `false` | If `true`, keeps the gift visible on Telegram after withdrawal. |

#### `client.confirmNftWithdrawal(transaction, confirmHash, keepGift?): Promise<NftWithdrawalConfirmResult>`

Confirm NFT withdrawal after initialization.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `transaction` | `string` | **(required)** | Transaction identifier. |
| `confirmHash` | `string` | **(required)** | Hash from `NftWithdrawalInitResult.confirmHash`. |
| `keepGift` | `boolean` | `false` | Keep gift visible on Telegram. |

---

### Stars Withdrawals

#### `client.getStarsWithdrawalState(transaction): Promise<StarsWithdrawalState>`

Get Stars withdrawal state.

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `transaction` | `string` | Transaction identifier. |

#### `client.initStarsWithdrawal(transaction, withdrawalData): Promise<StarsWithdrawalInitResult>`

Initialize Stars revenue withdrawal.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `transaction` | `string` | Transaction ID from `StarsWithdrawalState.transaction`. |
| `withdrawalData` | `string` | Data string from `StarsWithdrawalState.withdrawalData`. |

#### `client.confirmStarsWithdrawal(transaction, withdrawalData, confirmHash): Promise<StarsWithdrawalConfirmResult>`

Confirm Stars withdrawal.

**Requires:** `seed` + `apiKey` + `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `transaction` | `string` | Transaction identifier. |
| `withdrawalData` | `string` | Withdrawal data string. |
| `confirmHash` | `string` | Hash from `StarsWithdrawalInitResult.confirmHash`. |

---

### Anonymous Numbers (+888)

All methods require `stel_ton_token`.

#### `client.getLoginCode(number): Promise<LoginCodeResult>`

Fetch the current pending login code for an anonymous number.

| Parameter | Type | Description |
|---|---|---|
| `number` | `string` | Anonymous phone number (with or without `+`). |

#### `client.toggleLoginCodes(number, canReceive): Promise<void>`

Enable or disable login code delivery for an anonymous number.

| Parameter | Type | Description |
|---|---|---|
| `number` | `string` | Anonymous phone number. |
| `canReceive` | `boolean` | `true` to enable, `false` to disable. |

#### `client.terminateSessions(number): Promise<TerminateSessionsResult>`

Terminate all active Telegram sessions for an anonymous number. Requires a two-step confirmation internally.

| Parameter | Type | Description |
|---|---|---|
| `number` | `string` | Anonymous phone number. |

---

### Sessions

#### `client.getSessions(): Promise<SessionInfo[]>`

Get active Fragment sessions. **Requires:** `stel_ton_token`.

#### `client.terminateSession(sessionId): Promise<boolean>`

Terminate a specific Fragment session.

**Requires:** `stel_ton_token`.

| Parameter | Type | Description |
|---|---|---|
| `sessionId` | `string` | Session ID from `SessionInfo.sessionId`. |

**Returns:** `true` if session was terminated successfully.

---

### Low-Level / Advanced

#### `client.confirmRequest(reqId, boc, referer?): Promise<Record<string, any>>`

Send `confirmReq` to Fragment after broadcasting a TON transaction.

**Requires:** `stel_ton_token`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `reqId` | `string` | **(required)** | Fragment request ID. |
| `boc` | `string` | **(required)** | Base64-encoded BOC of the sent transaction. |
| `referer` | `string` | `"stars/buy"` | Fragment page path for the referer header. |

#### `client.call(method, data?, pageUrl?): Promise<Record<string, any>>`

Send a raw request to the Fragment API.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `method` | `string` | **(required)** | Fragment API method name. |
| `data` | `Record<string, any> \| null` | `null` | Additional form data. |
| `pageUrl` | `string` | `FRAGMENT_BASE_URL` | Page URL for referer and hash extraction. |

---

## Data Types & Interfaces

All interfaces are imported from `fragment-api-ts`.

### Purchase & Transaction Results

#### `PurchaseResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | TON transaction hash. |
| `type` | `string` | Purchase type: `"stars"`, `"premium"`, `"gram"`, `"ton"`. |
| `username` | `string` | Recipient username. |
| `amount` | `number` | Stars count, months, or GRAM amount depending on type. |
| `paymentMethod` | `string` | Payment method used. Default: `"gram"`. |

#### `PremiumResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | Transaction hash. |
| `username` | `string` | Recipient username. |
| `amount` | `number` | Duration in months. |
| `paymentMethod` | `string` | Payment method. Default: `"gram"`. |

#### `StarsResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | Transaction hash. |
| `username` | `string` | Recipient username. |
| `amount` | `number` | Stars count. |
| `paymentMethod` | `string` | Payment method. Default: `"gram"`. |

#### `AdsTopupResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | Transaction hash. |
| `username` | `string` | Ads account username. |
| `amount` | `number` | GRAM amount topped up. |

#### `GiveawayStarsResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | Transaction hash. |
| `channel` | `string` | Channel username. |
| `winners` | `number` | Number of winners. |
| `amount` | `number` | Total Stars amount. |
| `paymentMethod` | `string` | Payment method. Default: `"gram"`. |

#### `GiveawayPremiumResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | Transaction hash. |
| `channel` | `string` | Channel username. |
| `winners` | `number` | Number of winners. |
| `amount` | `number` | Duration in months. |
| `paymentMethod` | `string` | Payment method. Default: `"gram"`. |

#### `TransactionResult`

Returned by low-level transaction methods (`transferNft`, etc.).

| Field | Type | Description |
|---|---|---|
| `txHash` | `string` | Transaction hash string. |
| `boc` | `string \| null \| undefined` | Base64-encoded BOC of the sent message. Used for `confirmRequest`. |
| `seqnoBefore` | `number \| null \| undefined` | Wallet seqno before transaction. |
| `seqnoAfter` | `number \| null \| undefined` | Wallet seqno after confirmation. |
| `balanceBefore` | `number \| null \| undefined` | GRAM balance before transaction. |
| `balanceAfter` | `number \| null \| undefined` | GRAM balance after confirmation. |
| `confirmed` | `boolean` | `true` if seqno incremented and balance decreased. |

#### `BidResult`

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | Transaction hash. |
| `itemType` | `number` | Item type: `1` (username), `3` (number), `5` (gift). |
| `slug` | `string` | Item identifier. |
| `bid` | `number` | Bid amount in GRAM. |
| `confirmMethod` | `string \| null \| undefined` | Fragment confirmation method name. |
| `confirmId` | `string \| null \| undefined` | Fragment confirmation ID. |

---

### EVM Payment Types

#### `EvmPaymentResult`

Returned when an EVM payment method is used.

| Field | Type | Description |
|---|---|---|
| `itemKind` | `string` | Purchase type: `"stars"`, `"premium"`, `"giveaway_stars"`, `"giveaway_premium"`. |
| `target` | `string` | Recipient username or channel. |
| `amount` | `number` | Stars, months, or GRAM amount. |
| `paymentMethod` | `string` | EVM payment method string. |
| `invoice` | `EvmInvoice` | Invoice details for on-chain payment. |

#### `EvmInvoice`

| Field | Type | Description |
|---|---|---|
| `reqId` | `string` | Fragment request ID. |
| `invoiceAddress` | `string` | EVM contract/address to send tokens to. |
| `invoiceToken` | `string` | Token contract address (e.g., USDT on Ethereum). |
| `invoiceChainId` | `number` | EVM chain ID (1 = ETH, 8453 = BASE, 137 = POL). |
| `invoiceChainName` | `string` | Human-readable chain name: `"ETH"`, `"BASE"`, `"POL"`. |
| `invoiceAmountHex` | `string` | Token amount as hex string (e.g., `"0x5f5e100"`). |
| `invoiceAmount` | `number` | Token amount as float (e.g., `10.5`). |
| `invoiceAmountRaw` | `number` | Token amount as raw integer (smallest unit). |
| `tokenSymbol` | `string` | Token symbol: `"USDT"` or `"USDC"`. |
| `tokenDecimals` | `number` | Token decimal places (typically `6`). |
| `expiresAt` | `number` | Invoice expiration Unix timestamp. |
| `paymentMethod` | `string` | Payment method string. |
| `apiHash` | `string` | Fragment API hash for confirmation. |
| `pageUrl` | `string` | Full Fragment invoice page URL. |

#### `PreparedTransaction`

Unsigned transaction payload for external signing scenarios.

| Field | Type | Description |
|---|---|---|
| `reqId` | `string` | Fragment request ID. |
| `itemKind` | `string` | Purchase type. |
| `target` | `string` | Recipient. |
| `amount` | `number` | Amount. |
| `validUntil` | `number` | Expiration timestamp. |
| `messages` | `PreparedTransactionMessage[]` | List of transaction messages. |
| `raw` | `Record<string, any>` | Raw Fragment payload. |
| `senderAddress` | `string \| null \| undefined` | Sender wallet address. |
| `confirmReferer` | `string \| null \| undefined` | Referer path for confirmation. |

#### `PreparedTransactionMessage`

| Field | Type | Description |
|---|---|---|
| `address` | `string` | Destination TON address. |
| `amount` | `string` | Amount in nanograms as string. |
| `payload` | `string \| null \| undefined` | Base64-encoded BOC payload. |
| `stateInit` | `string \| null \| undefined` | Base64-encoded state init. |

---

### Marketplace Item Info

#### `UsernameInfo`

| Field | Type | Description |
|---|---|---|
| `username` | `string` | Username without `@`. |
| `status` | `string` | Item status: `"Available"`, `"On Auction"`, `"Sold"`, etc. |
| `itemType` | `number` | Always `1` for usernames. |
| `gramRate` | `number` | Current GRAM/USD exchange rate. |
| `auction` | `AuctionInfo \| null \| undefined` | Auction details if active. |
| `auctionEnd` | `string \| null \| undefined` | ISO datetime string of auction end time. |
| `ownerWallet` | `string \| null \| undefined` | Current owner's TON wallet address. |
| `purchasedDate` | `string \| null \| undefined` | ISO datetime of last purchase. |
| `bidHistory` | `BidHistoryEntry[]` | List of historical bids. |
| `ownerHistory` | `OwnerHistoryEntry[]` | List of past owners. |
| `bidHistoryNextOffset` | `string \| null \| undefined` | Pagination cursor for more bid history. |
| `ownerHistoryNextOffset` | `string \| null \| undefined` | Pagination cursor for more owner history. |

#### `NumberInfo`

| Field | Type | Description |
|---|---|---|
| `number` | `string` | Number without `+`. |
| `displayNumber` | `string` | Formatted display string (e.g., `"+888 1234 5678"`). |
| `status` | `string` | Item status. |
| `itemType` | `number` | Always `3` for numbers. |
| `gramRate` | `number` | Current GRAM/USD rate. |
| `restricted` | `boolean` | `true` if number has usage restrictions. |
| `auction` | `AuctionInfo \| null \| undefined` | Auction details. |
| `auctionEnd` | `string \| null \| undefined` | Auction end datetime. |
| `ownerWallet` | `string \| null \| undefined` | Owner wallet address. |
| `purchasedDate` | `string \| null \| undefined` | Purchase datetime. |
| `bidHistory` | `BidHistoryEntry[]` | Bid history. |
| `ownerHistory` | `OwnerHistoryEntry[]` | Owner history. |
| `bidHistoryNextOffset` | `string \| null \| undefined` | Pagination cursor. |
| `ownerHistoryNextOffset` | `string \| null \| undefined` | Pagination cursor. |

#### `GiftInfo`

| Field | Type | Description |
|---|---|---|
| `slug` | `string` | Gift identifier. |
| `name` | `string` | Display name of the gift. |
| `status` | `string` | Item status. |
| `itemType` | `number` | Always `5` for gifts. |
| `gramRate` | `number` | Current GRAM/USD rate. |
| `imageUrl` | `string \| null \| undefined` | URL of the gift preview image. |
| `stickerUrl` | `string \| null \| undefined` | URL of the `.tgs` sticker file. |
| `ownerWallet` | `string \| null \| undefined` | Owner wallet address. |
| `purchasedDate` | `string \| null \| undefined` | Purchase datetime. |
| `auction` | `AuctionInfo \| null \| undefined` | Auction details. |
| `auctionEnd` | `string \| null \| undefined` | Auction end datetime. |
| `attributes` | `GiftAttribute[]` | Gift traits/properties. |
| `issued` | `string \| null \| undefined` | Issuance info string. |
| `bidHistory` | `BidHistoryEntry[]` | Bid history. |
| `ownerHistory` | `OwnerHistoryEntry[]` | Owner history. |
| `bidHistoryNextOffset` | `string \| null \| undefined` | Pagination cursor. |
| `ownerHistoryNextOffset` | `string \| null \| undefined` | Pagination cursor. |

---

### Marketplace Search Results

#### `UsernamesResult`

| Field | Type | Description |
|---|---|---|
| `items` | `Record<string, any>[]` | List of item objects with keys: `slug`, `name`, `status`, `price`, `date`. |
| `nextOffsetId` | `string \| null` | Pagination cursor for next page. `null` if no more results. |

#### `NumbersResult`

Same structure as `UsernamesResult`.

#### `GiftsResult`

| Field | Type | Description |
|---|---|---|
| `items` | `Record<string, any>[]` | List of gift item objects with keys: `slug`, `name`, `status`, `price`, `date`. |
| `nextOffset` | `number \| null` | Numeric offset for next page. `null` if no more results. |

---

### Price Models

#### `StarsPrice`

| Field | Type | Description |
|---|---|---|
| `stars` | `number` | Number of Stars in this package. |
| `gramPrice` | `string` | Price in GRAM as string (e.g., `"1.25"`). |
| `usdPrice` | `string` | Price in USD as string (e.g., `"3.99"`). |

#### `StarsPrices`

| Field | Type | Description |
|---|---|---|
| `packages` | `StarsPrice[]` | All available Stars packages. |
| `gramRate` | `number` | Current GRAM/USD exchange rate. |

#### `PremiumPriceOption`

| Field | Type | Description |
|---|---|---|
| `months` | `number` | Duration in months. |
| `label` | `string` | Display label (e.g., `"3 months"`). |
| `gramPrice` | `string` | Price in GRAM. |
| `usdPrice` | `string` | Price in USD. |
| `discount` | `string \| null \| undefined` | Discount badge text (e.g., `"-20%"`). |

#### `PremiumPrices`

| Field | Type | Description |
|---|---|---|
| `options` | `PremiumPriceOption[]` | Available Premium plans. |
| `gramRate` | `number` | Current GRAM/USD rate. |

---

### History Models

#### `StarsTransaction`

| Field | Type | Description |
|---|---|---|
| `recipient` | `string` | Recipient username. |
| `stars` | `number` | Stars amount. |
| `priceGram` | `string` | Price paid in GRAM. |
| `date` | `string` | ISO datetime string. |

#### `PremiumTransaction`

| Field | Type | Description |
|---|---|---|
| `recipient` | `string` | Recipient username. |
| `duration` | `string` | Duration label (e.g., `"3 months"`). |
| `priceGram` | `string` | Price paid in GRAM. |
| `date` | `string` | ISO datetime string. |

#### `TopupTransaction`

| Field | Type | Description |
|---|---|---|
| `recipient` | `string` | Ads account username. |
| `amount` | `number` | GRAM amount. |
| `date` | `string` | ISO datetime string. |

---

### Account & Profile Models

#### `WalletInfo`

| Field | Type | Description |
|---|---|---|
| `address` | `string` | TON wallet address (user-friendly, non-bounceable). |
| `state` | `string` | Wallet state: `"active"`, `"uninitialized"`, etc. |
| `gramBalance` | `number` | GRAM balance (e.g., `12.5432`). |
| `usdtBalance` | `number` | USDT balance (e.g., `100.0`). |

#### `ProfileInfo`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name. |
| `username` | `string` | Telegram username without `@`. |
| `photoUrl` | `string \| null` | Profile photo URL. |
| `identityVerified` | `boolean` | `true` if KYC identity verification is complete. |
| `walletAddress` | `string \| null` | Linked TON wallet address. |
| `walletLabel` | `string \| null` | Shortened wallet label. |
| `walletVerified` | `boolean` | `true` if wallet is verified. |

#### `RecipientInfo`

| Field | Type | Description |
|---|---|---|
| `recipient` | `string` | Fragment-internal recipient identifier. |
| `name` | `string` | Display name. |
| `photoUrl` | `string \| null \| undefined` | Avatar URL. |
| `myself` | `boolean` | `true` if the recipient is the authenticated user. |

#### `SessionInfo`

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Session identifier for `terminateSession()`. |
| `device` | `string` | Device description. |
| `location` | `string` | Geographic location. |
| `date` | `string \| null` | Last activity datetime. |
| `isCurrent` | `boolean` | `true` if this is the current active session. |

---

### Asset Management Models

#### `MyAsset`

| Field | Type | Description |
|---|---|---|
| `itemType` | `string` | `"usernames"`, `"numbers"`, or `"gifts"`. |
| `slug` | `string` | Item identifier (e.g., `"username/durov"`, `"gift/abc123"`). |
| `name` | `string` | Display name. |
| `description` | `string \| null \| undefined` | Additional description text. |
| `imageUrl` | `string \| null \| undefined` | Preview image URL (gifts only). |
| `assignedTo` | `string \| null \| undefined` | Telegram account ID if assigned. |
| `assignedName` | `string \| null \| undefined` | Telegram account name if assigned. |

#### `MyAssetsResult`

| Field | Type | Description |
|---|---|---|
| `items` | `MyAsset[]` | List of owned assets. |
| `gramRate` | `number` | Current GRAM/USD rate. |
| `totalCount` | `number` | Total number of assets of this type. |

#### `MyBid`

| Field | Type | Description |
|---|---|---|
| `itemType` | `string` | `"usernames"`, `"numbers"`, or `"gifts"`. |
| `slug` | `string` | Item identifier. |
| `name` | `string` | Display name. |
| `bid` | `number` | Bid amount in GRAM. |
| `status` | `string` | Bid status (e.g., `"Outbid"`, `"Winning"`, `"Won"`). |
| `date` | `string` | ISO datetime of the bid. |
| `imageUrl` | `string \| null \| undefined` | Preview image (gifts only). |
| `description` | `string \| null \| undefined` | Additional description. |

#### `MyBidsResult`

| Field | Type | Description |
|---|---|---|
| `items` | `MyBid[]` | List of bids. |
| `gramRate` | `number` | Current GRAM/USD rate. |
| `totalCount` | `number` | Total number of bids for this item type. |

#### `TelegramAccount`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Account ID used for assignment. |
| `name` | `string` | Account display name. |
| `type` | `string` | Account type description. |
| `photoUrl` | `string \| null \| undefined` | Account avatar URL. |

#### `AssignAccountsResult`

| Field | Type | Description |
|---|---|---|
| `accounts` | `TelegramAccount[]` | Available accounts. |
| `canDisable` | `boolean` | `true` if the "Don't display on Telegram" option is available. |

#### `AssignResult`

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | `true` if assignment succeeded. |
| `message` | `string \| null \| undefined` | Status message or error text. |
| `needPay` | `boolean \| undefined` | `true` if a fee payment is required to assign. |
| `reqId` | `string \| null \| undefined` | Payment request ID (if `needPay` is `true`). |
| `amount` | `string \| null \| undefined` | Fee amount (if `needPay` is `true`). |
| `assignName` | `string \| null \| undefined` | Name of the account the asset was assigned to. |

#### `PurchaseItem`

Input model for batch purchases.

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `string` | **(required)** | `"stars"`, `"premium"`, `"gram"`, or `"ton"`. |
| `username` | `string` | **(required)** | Recipient username. |
| `amount` | `number \| null \| undefined` | `undefined` | Stars count or GRAM amount. |
| `months` | `number \| null \| undefined` | `undefined` | Premium months. |
| `showSender` | `boolean \| undefined` | `true` | Show sender name. |

---

### NFT & Withdrawal Models

#### `NftTransferRecipient`

| Field | Type | Description |
|---|---|---|
| `myself` | `boolean` | `true` if the recipient is the authenticated user. |
| `recipient` | `string` | Fragment recipient identifier. |
| `name` | `string` | Display name. |
| `photoUrl` | `string \| null \| undefined` | Avatar URL. |

#### `NftTransferRequest`

| Field | Type | Description |
|---|---|---|
| `reqId` | `string` | Transfer request ID for `transferNft()`. |
| `myself` | `boolean` | `true` if transferring to self. |
| `itemTitle` | `string` | Gift name. |
| `content` | `string` | Confirmation message HTML. |
| `button` | `string` | Confirmation button text. |

#### `NftWithdrawalInitResult`

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | `true` if initialization succeeded. |
| `confirmMessage` | `string \| null \| undefined` | Human-readable confirmation message. |
| `confirmButton` | `string \| null \| undefined` | Button label text. |
| `confirmHash` | `string \| null \| undefined` | Hash needed for `confirmNftWithdrawal()`. |
| `error` | `string \| null \| undefined` | Error message if `ok` is `false`. |

#### `NftWithdrawalConfirmResult`

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | `true` if confirmation succeeded. |
| `needUpdate` | `boolean` | `true` if the page needs to be refreshed. |
| `mode` | `string` | Result mode: `"done"`, `"error"`, etc. |
| `html` | `string \| null \| undefined` | Updated page HTML. |
| `error` | `string \| null \| undefined` | Error message if failed. |

#### `StarsWithdrawalState`

| Field | Type | Description |
|---|---|---|
| `transaction` | `string` | Transaction identifier. |
| `withdrawalData` | `string` | Encoded withdrawal data for init/confirm. |

#### `StarsWithdrawalInitResult`

Same structure as `NftWithdrawalInitResult`.

#### `StarsWithdrawalConfirmResult`

Same structure as `NftWithdrawalConfirmResult`.

#### `StartAuctionResult`

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | `true` if auction started successfully. |
| `reqId` | `string \| null \| undefined` | Confirmation request ID. |

---

### Anonymous Number Models

#### `LoginCodeResult`

| Field | Type | Description |
|---|---|---|
| `number` | `string` | The anonymous phone number queried. |
| `code` | `string \| null` | The pending login code, or `null` if no code is pending. |
| `activeSessions` | `number` | Number of active Telegram sessions on this number. |

#### `TerminateSessionsResult`

| Field | Type | Description |
|---|---|---|
| `number` | `string` | The anonymous phone number. |
| `message` | `string \| null` | Server response message. |

---

### Batch Models

#### `BatchResult`

| Field | Type | Description |
|---|---|---|
| `total` | `number` | Total number of items in the batch. |
| `succeeded` | `number` | Number of items that completed successfully. |
| `failed` | `number` | Number of items that failed. |
| `chunksSent` | `number` | Number of on-chain transaction chunks successfully broadcast. |
| `items` | `BatchItemResult[]` | Per-item results. |

#### `BatchItemResult`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Purchase type. |
| `username` | `string` | Recipient username. |
| `amount` | `number` | Stars, months, or GRAM amount. |
| `ok` | `boolean` | `true` if this item succeeded. |
| `result` | `any` | Result object with `transaction_id` if successful. |
| `error` | `string \| null \| undefined` | Error message if failed. |
| `chunkIndex` | `number` | Index of the transaction chunk this item belongs to. |

---

### Auction Models

#### `AuctionInfo`

| Field | Type | Description |
|---|---|---|
| `highestBid` | `string \| null \| undefined` | Current highest bid in GRAM. |
| `bidStep` | `string \| null \| undefined` | Minimum bid increment in GRAM. |
| `minimumBid` | `string \| null \| undefined` | Minimum allowed bid in GRAM. |
| `sellPrice` | `string \| null \| undefined` | Fixed sell price in GRAM (for sale items). |
| `buyNowPrice` | `string \| null \| undefined` | Buy-now price in GRAM (if available). |

#### `BidHistoryEntry`

| Field | Type | Description |
|---|---|---|
| `price` | `string \| null` | Bid amount in GRAM. |
| `date` | `string \| null` | ISO datetime of the bid. |
| `wallet` | `string \| null` | Bidder wallet address. |

#### `OwnerHistoryEntry`

| Field | Type | Description |
|---|---|---|
| `price` | `string \| null` | Purchase price or `"Transferred"`. |
| `date` | `string \| null` | ISO datetime. |
| `wallet` | `string \| null` | Owner wallet address. |

---

### Helper Models

#### `GiftAttribute`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Trait name (e.g., `"Background"`). |
| `value` | `string` | Trait value (e.g., `"Red"`). |
| `rarity` | `string \| null \| undefined` | Rarity percentage (e.g., `"2.5%"`). |

---

## Exceptions

All exceptions are importable from `fragment-api-ts`.

### Exception Hierarchy

```
FragmentError (base)
├── ClientError
│   ├── ConfigurationError (alias: ConfigError)
│   └── CookieError
├── FragmentAPIError
│   ├── FragmentPageError
│   ├── UserNotFoundError
│   ├── AlreadySubscribedError
│   ├── AnonymousNumberError
│   ├── TransactionError
│   │   ├── ConfirmationTimeout
│   │   └── SeqnoError
│   ├── ParseError
│   └── VerificationError
└── OperationError
    ├── WalletError
    └── UnexpectedError
```

### Base Exceptions

#### `FragmentError`

Base exception for all Fragment API library errors. Catch this to handle any library exception.

```typescript
import { FragmentError } from "fragment-api-ts";

try {
  const result = await client.purchaseStars("durov", 100);
} catch (e) {
  if (e instanceof FragmentError) {
    console.error(`Fragment operation failed: ${e.message}`);
  }
}
```

---

### Client Exceptions

#### `ConfigurationError`

Raised when required client parameters are missing or invalid.

| Message Constant | Description |
|---|---|
| `MISSING_VARS` | Required parameter(s) not provided. |
| `UNSUPPORTED_VERSION` | Invalid `walletVersion` value. |
| `INVALID_MNEMONIC` | Seed phrase has wrong word count (not 12, 18, or 24). |
| `UNSUPPORTED_PROVIDER` | Invalid `apiProvider` value. |
| `UNSUPPORTED_METHOD` | EVM payment not supported for this purchase type. |
| `INVALID_MONTHS` | Premium months not in {3, 6, 12}. |
| `INVALID_STARS_AMOUNT` | Stars amount outside 50–10,000,000 range. |
| `INVALID_GRAM_AMOUNT` | GRAM amount outside 1–1,000,000,000 range. |
| `INVALID_WINNERS_STARS` | Stars giveaway winners outside valid range. |
| `INVALID_WINNERS_PREMIUM` | Premium giveaway winners outside 1–24,000 range. |
| `INVALID_STARS_PER_WINNER` | Stars per winner outside 500–1,000,000 range. |
| `INVALID_PAYMENT_METHOD` | Unrecognized payment method string. |
| `INVALID_GIVEAWAY_PACKAGE` | Stars giveaway amount not in allowed packages. |
| `INVALID_GIVEAWAY_WINNERS` | Winners count exceeds maximum for given amount. |
| `SEED_REQUIRED` | Operation requires seed but none configured. |
| `TON_TOKEN_REQUIRED` | Operation requires `stel_ton_token` cookie. |
| `API_KEY_REQUIRED` | Operation requires API key but none configured. |

---

#### `CookieError`

Raised when cookies are unreadable or missing required fields.

| Message Constant | Description |
|---|---|
| `READ_FAILED` | Cookie string could not be parsed. |
| `MISSING_KEYS` | One or more required cookie keys are empty or missing. |
| `UNSUPPORTED_BROWSER` | Browser cookie extraction not supported. |
| `BROWSER_READ_FAILED` | Failed to read cookies from browser. |
| `MISSING_BROWSER_KEYS` | Required cookies not found in browser. |
| `EXPIRED` | Session cookie has expired. |

---

### API Exceptions

#### `FragmentAPIError`

General error from Fragment API responses.

| Message Constant | Description |
|---|---|
| `NO_REQUEST_ID` | Fragment did not return a request ID. Session may have expired. |

---

#### `FragmentPageError`

Raised when Fragment pages cannot be fetched or API hash not found.

| Message Constant | Description |
|---|---|
| `BAD_STATUS` | Fragment returned non-200 HTTP status. |
| `HASH_NOT_FOUND` | Could not extract API hash from page HTML. |
| `ITEM_NOT_FOUND` | Fragment returned HTTP 302 redirect (item not found). |

---

#### `UserNotFoundError`

Raised when target Telegram user is not found on Fragment.

| Message Constant | Description |
|---|---|
| `NOT_FOUND` | Username not found on Fragment. |
| `NOT_A_USER` | Username belongs to a channel or bot, not a user account. |

---

#### `AlreadySubscribedError`

Raised when trying to gift Premium to a user who already has it.

| Message Constant | Description |
|---|---|
| `PREMIUM_ACTIVE` | Account already has active Telegram Premium. |

---

#### `AnonymousNumberError`

Raised for anonymous number operation failures.

| Message Constant | Description |
|---|---|
| `NOT_OWNED` | Number not associated with your Fragment account. |
| `TERMINATE_FAILED` | Session termination failed with server error. |

---

#### `TransactionError`

Raised when TON transaction fails to build or broadcast.

| Message Constant | Description |
|---|---|
| `INVALID_PAYLOAD` | Fragment returned empty or malformed transaction messages. |
| `BROADCAST_FAILED` | Transaction broadcast to TON network failed. |
| `BROADCAST_SSL_ERROR` | SSL certificate error during broadcast. |
| `DUPLICATE_SEQNO` | Previous transaction with same seqno still pending. Wait and retry. |

---

#### `ConfirmationTimeout` (extends `TransactionError`)

Transaction was sent but confirmation was not received within the timeout window. The transaction may have succeeded — check the blockchain manually.

| Message Constant | Description |
|---|---|
| `TIMEOUT` | Seqno/balance did not change within timeout period. |

---

#### `SeqnoError` (extends `TransactionError`)

| Message Constant | Description |
|---|---|
| `FETCH_FAILED` | Could not retrieve wallet seqno from network. |
| `STALE` | Seqno did not increment after broadcast. |

---

#### `ParseError`

| Message Constant | Description |
|---|---|
| `UNPARSEABLE` | Fragment response could not be parsed (invalid JSON/HTML). |

---

#### `VerificationError`

| Message Constant | Description |
|---|---|
| `KYC_REQUIRED` | Fragment requires KYC identity verification. Complete at https://fragment.com/my/profile. |

---

### Operation Exceptions

#### `WalletError`

Raised for TON wallet issues.

| Message Constant | Description |
|---|---|
| `LOW_GRAM_BALANCE` | Insufficient GRAM balance for transaction + gas. |
| `LOW_USDT_BALANCE` | Insufficient USDT balance. |
| `GRAM_BALANCE_CHECK_FAILED` | Failed to fetch GRAM balance from network. |
| `USDT_BALANCE_CHECK_FAILED` | Failed to fetch USDT balance from network. |
| `ACCOUNT_INFO_FAILED` | Failed to build wallet account info. |
| `WALLET_INFO_FAILED` | Failed to retrieve wallet info. |

---

#### `UnexpectedError`

Wraps any unexpected internal exception.

| Message Constant | Description |
|---|---|
| `UNEXPECTED` | Generic wrapper for unhandled exceptions. |

---

## Constants & Limits

| Constant | Value | Description |
|---|---|---|
| `STARS_PURCHASE_MIN` | `50` | Minimum Stars per purchase. |
| `STARS_PURCHASE_MAX` | `10_000_000` | Maximum Stars per purchase. |
| `GRAM_TOPUP_MIN` | `1` | Minimum GRAM for Ads top-up. |
| `GRAM_TOPUP_MAX` | `1_000_000_000` | Maximum GRAM for Ads top-up. |
| `PREMIUM_MONTHS_VALID` | `Set([3, 6, 12])` | Allowed Premium durations. |
| `STARS_GIVEAWAY_MIN` | `500` | Minimum Stars per giveaway winner. |
| `STARS_GIVEAWAY_MAX` | `1_000_000` | Maximum Stars per giveaway winner. |
| `STARS_WINNERS_MIN` | `1` | Minimum giveaway winners (Stars). |
| `STARS_WINNERS_MAX` | `5` | Maximum giveaway winners (Stars, depends on amount). |
| `PREMIUM_WINNERS_MIN` | `1` | Minimum giveaway winners (Premium). |
| `PREMIUM_WINNERS_MAX` | `24_000` | Maximum giveaway winners (Premium). |
| `MIN_GRAM_BALANCE` | `0.01` | Minimum GRAM reserved for gas fees. |
| `DEFAULT_TIMEOUT` | `30000` | Default HTTP timeout in ms. |
| `CONFIRMATION_INTERVAL` | `3000` | Milliseconds between confirmation polls. |
| `CONFIRMATION_MAX_ATTEMPTS` | `40` | Maximum confirmation poll attempts (total ~120s). |
| `WALLET_MAX_MESSAGES["V4R2"]` | `4` | Max messages per transaction for V4R2 wallets. |
| `WALLET_MAX_MESSAGES["V5R1"]` | `255` | Max messages per transaction for V5R1 wallets. |

**Stars giveaway allowed packages:** 500, 1000, 1500, 2500, 5000, 10000, 25000, 35000, 50000, 100000, 150000, 500000, 1000000.

---

## Examples

### Full Mode — Purchase Stars

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: {
      stel_ssid: "...",
      stel_dt: "-180",
      stel_token: "...",
      stel_ton_token: "...",
    },
    seed: "word1 word2 word3 ... word24",
    apiKey: "your_tonapi_key",
    walletVersion: "V5R1",
  });

  const result = await client.purchaseStars("durov", 500);
  console.log(`Sent 500 Stars! TX: ${result.transactionId}`);
}

main();
```

### Batch Purchase Example

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: "stel_ssid=...; stel_dt=-180; stel_token=...; stel_ton_token=...",
    seed: "word1 word2 ... word24",
    apiKey: "your_tonapi_key",
  });

  const batch = await client.batchPurchase([
    { type: "stars", username: "user1", amount: 100 },
    { type: "stars", username: "user2", amount: 200 },
    { type: "premium", username: "user3", months: 3 },
  ]);

  console.log(`Results: ${batch.succeeded}/${batch.total} succeeded`);
  for (const item of batch.items) {
    const status = item.ok ? "✓" : `✗ ${item.error}`;
    console.log(`  ${item.username}: ${status}`);
  }
}

main();
```

### EVM Payment Flow

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: { stel_ssid: "...", stel_dt: "-180", stel_token: "..." },
  });

  const result = await client.purchaseStars("durov", 100, true, "usdc_base");

  if ("invoice" in result) {
    const inv = result.invoice;
    console.log(`Chain: ${inv.invoiceChainName} (ID: ${inv.invoiceChainId})`);
    console.log(`Token: ${inv.tokenSymbol} at ${inv.invoiceToken}`);
    console.log(`Send: ${inv.invoiceAmount} ${inv.tokenSymbol}`);
    console.log(`To: ${inv.invoiceAddress}`);
    console.log(`Expires: ${inv.expiresAt}`);
  }
}

main();
```

### Search Marketplace

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: { stel_ssid: "...", stel_dt: "-180", stel_token: "..." },
  });

  // Search usernames
  const usernames = await client.searchUsernames("crypto", "price_asc");
  for (const item of usernames.items) {
    console.log(`@${item.name} — ${item.price} GRAM — ${item.status}`);
  }

  // Search gifts with attributes
  const gifts = await client.searchGifts("plush", "plush-octopus", null, null, null, {
    Background: ["Red", "Blue"],
  });
  for (const gift of gifts.items) {
    console.log(`${gift.name} — ${gift.price} GRAM`);
  }

  // Get detailed info
  const info = await client.getUsernameInfo("durov");
  console.log(`Status: ${info.status}`);
  if (info.auction) {
    console.log(`Highest bid: ${info.auction.highestBid} GRAM`);
  }
}

main();
```

### Anonymous Number Management

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: { stel_ssid: "...", stel_dt: "-180", stel_token: "...", stel_ton_token: "..." },
  });

  // Check login code
  const codeResult = await client.getLoginCode("+88812345678");
  if (codeResult.code) {
    console.log(`Login code: ${codeResult.code}`);
  }
  console.log(`Active sessions: ${codeResult.activeSessions}`);

  // Enable code delivery
  await client.toggleLoginCodes("+88812345678", true);

  // Terminate all sessions
  const term = await client.terminateSessions("+88812345678");
  console.log(`Result: ${term.message}`);
}

main();
```

### NFT Transfer Example

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: {
      stel_ssid: "...",
      stel_dt: "-180",
      stel_token: "...",
      stel_ton_token: "...",
    },
    seed: "word1 word2 ... word24",
    apiKey: "your_tonapi_key",
  });

  // Find recipient
  const recipient = await client.searchNftTransferRecipient("durov");
  if (!recipient) {
    console.log("Recipient not found");
    return;
  }

  // Initialize transfer
  const request = await client.initNftTransfer("gift-slug-123", recipient.recipient);
  console.log(`Transferring: ${request.itemTitle}`);

  // Execute transfer
  const tx = await client.transferNft(request.reqId);
  console.log(`Transfer complete! TX: ${tx.txHash}`);
}

main();
```

### Auto Authentication Example

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  // QR code flow (default)
  const cookies = await FragmentClient.authenticate({
    seed: "word1 word2 ... word24",
    walletVersion: "V5R1",
    printQr: true,
  });
  console.log("Cookies obtained:", Object.keys(cookies));

  // Phone flow
  /*
  const phoneCookies = await FragmentClient.authenticate({
    seed: "word1 word2 ... word24",
    phone: "+71234567890",
  });
  */

  // Use cookies
  const client = new FragmentClient({
    cookies,
    seed: "word1 word2 ... word24",
    apiKey: "your_tonapi_key",
  });

  const wallet = await client.getWallet();
  console.log(`Balance: ${wallet.gramBalance} GRAM`);
}

main();
```

---

## Support & License

**Reporting Issues**
Create an [Issue](https://github.com/s1qwy/fragment-api-ts/issues) or message in the [Telegram chat](https://t.me/fragment_api_lib).

**Support the Project**

TON Wallet: `UQBsyxZvyQxDwAeOxoaWwO2HJoAmCKUoJlS_OpLzWHD9i2Xj`

**License:** MIT — free for commercial and personal use.

---

<p align="center">
  <a href="https://github.com/s1qwy/fragment-api-ts">GitHub</a> •
  <a href="https://www.npmjs.com/package/fragment-api-ts">npm</a> •
  <a href="https://t.me/fragment_api_lib">Telegram Chat</a>
</p>
```