Вот готовый `README.md`, полностью адаптированный под TypeScript/JavaScript с актуальными сигнатурами методов, camelCase именованием, ссылками на npm и примерами на TS:

```markdown
<p align="center">
  <img src="https://fragment.com/img/fragment_icon.svg" width="200" alt="Fragment API TypeScript">
</p>

<h1 align="center">Fragment API TypeScript SDK</h1>

<p align="center">
  <strong>Async TypeScript / Node.js library for Fragment.com automation</strong><br>
  <strong>v1.0.0 — Full TypeScript Support | Batch Operations | EVM Payments | Full Marketplace</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/fragment-api-ts"><img src="https://img.shields.io/npm/v/fragment-api-ts.svg?style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/fragment-api-ts"><img src="https://img.shields.io/npm/dm/fragment-api-ts.svg?style=flat-square" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/fragment-api-ts"><img src="https://img.shields.io/npm/l/fragment-api-ts.svg?style=flat-square" alt="License"></a>
  <a href="https://t.me/fragment_api_py"><img src="https://img.shields.io/badge/Telegram-Channel-2CA5E0?style=flat-square&logo=telegram" alt="Telegram"></a>
</p>

<p align="center">
  <a href="https://github.com/s1qwy/fragment-api-ts"><img src="https://img.shields.io/badge/GitHub-s1qwy/fragment--api--ts-181717?style=flat-square&logo=github" alt="GitHub"></a>
  <a href="DOC.md"><img src="https://img.shields.io/badge/Documentation-DOC.md-6366f1?style=flat-square" alt="Docs"></a>
</p>

---

## Features

- **Async-first** — Native Promises & async/await via `FragmentClient`.
- **Purchases** — Stars (50–10M), Premium (3/6/12 months), Ads top-up.
- **Batch Operations** — Multiple purchases grouped into single on-chain multi-messages.
- **EVM Payments** — USDT/USDC on Ethereum, Polygon, and BASE chains (Invoice generation).
- **Giveaways** — Stars and Premium giveaways for channels (up to 24K winners).
- **Marketplace** — Search/bid on usernames, numbers, and gifts with pagination.
- **Auctions** — Start auctions, set fixed prices, place bids, buy-now.
- **NFTs & Gifts** — Transfer, withdraw to wallet, manage Stars revenue.
- **Wallet Support** — Native V4R2 and V5R1 support via `@ton/ton`. Check TON and USDT balances.
- **Authentication** — Auto-authenticate via TON wallet proof + Telegram OAuth (QR/phone).
- **Anonymous Numbers** — Login codes, toggle delivery, terminate sessions (+888).
- **Asset Management** — List owned assets, bid history, assign to Telegram accounts.

---

## Installation

```bash
npm install fragment-api-ts
```
*Or using yarn / pnpm:*
```bash
yarn add fragment-api-ts
# pnpm add fragment-api-ts
```

**Requirements:**
- Node.js 18.0.0+
- Fragment cookies (`stel_ssid`, `stel_dt`, `stel_token`; `stel_ton_token` for wallet operations)
- TON wallet seed phrase (12/18/24 words) — for on-chain transactions
- Tonconsole or Toncenter API key — for blockchain interactions

Get a free API key at [tonconsole.com](https://tonconsole.com/).

---

## Quick Start

```typescript
import { FragmentClient } from "fragment-api-ts";
import type { EvmPaymentResult } from "fragment-api-ts";

async function main() {
  const client = new FragmentClient({
    cookies: {
      stel_ssid: "...",
      stel_token: "...",
      stel_dt: "-180",
      stel_ton_token: "..."
    },
    seed: "word1 word2 ... word24",
    apiKey: "your_tonapi_key",
    apiProvider: "tonapi", // or "toncenter"
    walletVersion: "V5R1",  // or "V4R2"
  });

  // 1. Check wallet balance
  const wallet = await client.getWallet();
  console.log(`Balance: ${wallet.gramBalance} TON, ${wallet.usdtBalance} USDT`);

  // 2. Purchase Stars
  const result = await client.purchaseStars("durov", 100);
  console.log(`TX: ${result.transactionId}`);

  // 3. Batch purchases
  const batch = await client.batchPurchase([
    { type: "premium", username: "durov", months: 3 },
    { type: "stars", username: "telegram", amount: 250 },
  ]);
  console.log(`Batch: ${batch.succeeded}/${batch.total} succeeded`);

  // 4. EVM payment invoice
  const evm = await client.purchaseStars("durov", 50, true, "usdc_base");
  if ("invoice" in evm) {
    const inv = evm.invoice;
    console.log(`Send ${inv.invoiceAmount} ${inv.tokenSymbol} to ${inv.invoiceAddress}`);
  }
}

main();
```

---

## Authentication

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main() {
  // Auto-authenticate via TON wallet + Telegram OAuth
  const cookies = await FragmentClient.authenticate({
    seed: "word1 word2 ... word24",
    walletVersion: "V5R1",
    phone: "+71234567890", // Omit for interactive terminal QR code flow
    printQr: true,
  });

  const client = new FragmentClient({
    cookies,
    seed: "word1 word2 ... word24",
    apiKey: "your_tonapi_key",
  });

  const profile = await client.getProfile();
  console.log(`Logged in as: ${profile.name} (@${profile.username})`);
}

main();
```

---

## Payment Methods

| Method | Chain | Token | Behavior |
|--------|-------|-------|----------|
| `gram` / `ton` | TON | TON | Automatic on-chain TX |
| `usdt_gram` / `usdt_ton` | TON | USDT | Automatic on-chain TX |
| `usdt_eth` | Ethereum | USDT | Returns EVM invoice |
| `usdt_pol` | Polygon | USDT | Returns EVM invoice |
| `usdc_eth` | Ethereum | USDC | Returns EVM invoice |
| `usdc_base` | BASE | USDC | Returns EVM invoice |
| `usdc_pol` | Polygon | USDC | Returns EVM invoice |

---

## API Overview

For complete method signatures, parameters, return types, and models, see the **[Full Documentation (DOC.md)](DOC.md)**.

### Purchases & Giveaways
| Method | Description |
|--------|-------------|
| `purchase()` | Unified single/batch purchase |
| `purchaseStars()` | Send Stars to a user |
| `purchasePremium()` | Gift Premium to a user |
| `topupGram()` / `topupTon()` | Top up TON to Ads balance |
| `batchPurchase()` | Batched multi-item purchases |
| `giveawayStars()` | Stars giveaway for a channel |
| `giveawayPremium()` | Premium giveaway for a channel |

### Marketplace
| Method | Description |
|--------|-------------|
| `searchUsernames()` | Search username listings |
| `searchNumbers()` | Search anonymous numbers (+888) |
| `searchGifts()` | Search gift marketplace |
| `placeBid()` | Bid or buy-now on an item |
| `startAuction()` | Start an auction |
| `sellAsset()` | Sell at a fixed price |

### Asset Info & History
| Method | Description |
|--------|-------------|
| `getUsernameInfo()` | Detailed username info & bid history |
| `getNumberInfo()` | Detailed number info & history |
| `getGiftInfo()` | Detailed gift info & attributes |
| `getStarsPrices()` | Stars package prices |
| `getPremiumPrices()` | Premium prices |
| `getStarsHistory()` | Stars transaction history |
| `getPremiumHistory()` | Premium transaction history |
| `getTopupHistory()` | Ads topup history |

### Account & Assets
| Method | Description |
|--------|-------------|
| `getWallet()` | Wallet address & balances |
| `getProfile()` | Account profile info |
| `getSessions()` | Active Fragment sessions |
| `getMyAssets()` | Owned assets (usernames, numbers, gifts) |
| `getMyBids()` | Active/past bids history |
| `assignToTelegram()` | Assign asset to Telegram account |

### NFTs & Withdrawals
| Method | Description |
|--------|-------------|
| `initNftTransfer()` | Prepare gift transfer to user |
| `transferNft()` | Execute gift transfer |
| `initNftWithdrawal()` | Withdraw NFT to wallet |
| `initStarsWithdrawal()` | Withdraw Stars revenue |

### Anonymous Numbers
| Method | Description |
|--------|-------------|
| `getLoginCode()` | Fetch pending Telegram login code |
| `toggleLoginCodes()` | Enable/disable code delivery |
| `terminateSessions()` | Terminate all active sessions |

---

## Support & License

**Issues:** [GitHub Issues](https://github.com/s1qwy/fragment-api-ts/issues) or [Telegram Chat](https://t.me/fragment_api_py)

**Support the Project:**

<p align="center">
  <a href="https://app.tonkeeper.com/transfer/UQBsyxZvyQxDwAeOxoaWwO2HJoAmCKUoJlS_OpLzWHD9i2Xj">
    <img src="https://img.shields.io/badge/Donate-TON-0098ea?style=for-the-badge&logo=ton&logoColor=white" alt="Donate TON">
  </a>
</p>

<p align="center">
  <code>UQBsyxZvyQxDwAeOxoaWwO2HJoAmCKUoJlS_OpLzWHD9i2Xj</code>
</p>

**License:** MIT — free for commercial and personal use.

---

<p align="center">
  <a href="https://github.com/s1qwy/fragment-api-ts">GitHub</a> •
  <a href="https://www.npmjs.com/package/fragment-api-ts">npm</a> •
  <a href="https://t.me/fragment_api_lib">Telegram</a>
</p>
```