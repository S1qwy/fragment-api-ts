<p align="center">
  <img src="https://fragment.com/img/fragment_icon.svg" width="112" alt="Fragment">
</p>

<h1 align="center">Fragment API TypeScript</h1>

<p align="center">
  <strong>One async client. Exact payment accounting. Explicit outcomes.</strong>
</p>

<p align="center">
  Stars · Premium · Gifts · Usernames · Numbers · Ads · Gateway
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/fragment-api-ts">
    <img src="https://img.shields.io/npm/v/fragment-api-ts?style=flat-square&color=0098EA" alt="npm">
  </a>
  <img src="https://img.shields.io/badge/Node.js-22%2B-182C44?style=flat-square" alt="Node.js 22+">
  <a href="https://github.com/S1qwy/fragment-api-ts/wiki">
    <img src="https://img.shields.io/badge/Documentation-Wiki-0098EA?style=flat-square" alt="Documentation">
  </a>
  <img src="https://img.shields.io/badge/License-MIT-182C44?style=flat-square" alt="MIT">
</p>

---

**fragment-api-ts** is an unofficial TypeScript SDK for Fragment.com.

Browse the marketplace, resolve recipients, prepare TON transactions for external
signing, or configure a payer for automatic submission.

## Install

```bash
npm install fragment-api-ts
```

Requires Node.js 22 or newer.

Optional Redis storage:

```bash
npm install ioredis
```

## Choose a workflow

| Workflow | Configuration | Outcome |
|:--|:--|:--|
| Account access | Your Fragment cookies | User-owned account operations |
| Restricted access | No cookies | Wallet-proof session with limited capabilities |
| External TON signing | Sender account or seed, without provider key | Unsigned preparation |
| Automatic TON payment | Payer seed and provider key | Broadcast receipt and fulfillment state |
| EVM payment | Supported EVM method | Unpaid external invoice |

Restricted authentication does not bypass Fragment verification requirements.

The shared authentication wallet is not the automatic payer. Never deposit funds
into that publicly known wallet.

## Read a quote

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main(): Promise<void> {
  const client = new FragmentClient();

  try {
    const price = await client.getStarsPrice(100);
    console.log(`${price.tonPrice} TON`);
  } finally {
    await client.close();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
```

## Prepare before signing

```typescript
import { FragmentClient } from "fragment-api-ts";

async function main(): Promise<void> {
  const sender = process.env.TON_SENDER_ACCOUNT;
  const target = process.env.FRAGMENT_TARGET;

  if (!sender || !target) {
    throw new Error("Set TON_SENDER_ACCOUNT and FRAGMENT_TARGET.");
  }

  const client = new FragmentClient({
    cookies: process.env.FRAGMENT_COOKIES,
    senderAccount: JSON.parse(sender),
  });

  try {
    const result = await client.purchaseStars(target, 100);

    if ("messages" in result) {
      console.log({
        request: result.reqId,
        sender: result.senderAddress,
        messages: result.messages.length,
        feeNanoton: result.feeNanoton,
        requiredNanoton: result.requiredNanoton,
      });
    }
  } finally {
    await client.close();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
```

Use the actual external signer's account. Preserve every message, payload,
state initialization, sender, expiration, and original Fragment session.

## Payment accounting

> [!IMPORTANT]
> Native TON payments append a separate SDK fee of **0.5% of the explicit native
> principal**, rounded upward to integer nanotons.
>
> Fee destination:
> `UQAcsdD09x9dzj7Jc-MznN-SLUxPPMmwKQxsC2Ax_F03TBAH`

The percentage fee excludes attached gas.

- USDT-TON invoices do not receive this native percentage fee.
- EVM invoices do not receive a TON fee message.
- Zero-principal administrative operations do not receive a percentage fee.
- All outgoing messages count toward wallet capacity.
- The default native preflight reserve is 0.05 TON.

Base-unit monetary fields are decimal strings. Convert them with `BigInt` for
arithmetic. Do not convert payment amounts to JavaScript floating-point numbers.

## Know what happened

| State | Meaning |
|:--|:--|
| Prepared | Unsigned messages exist; nothing was submitted |
| Invoice | EVM payment must be performed externally |
| Broadcast | Provider submission returned; fulfillment is not established |
| Confirmed | Purchase polling observed Fragment's completion signal |
| Unknown | Submission outcome requires reconciliation |

`txHash` and `transactionId` identify the signed external message, not an inferred
latest on-chain transaction.

> [!WARNING]
> Do not automatically repeat a payment after an uncertain submission or
> fulfillment timeout. Reconcile the original request first.

## Wallets

| Contract | Message limit | Signing |
|:--|--:|:--|
| V4R2 | 4 | Built in |
| V5R1 | 255 | Built in |
| HighloadV2 | 254 | Explicit wallet adapter |
| HighloadV3R1 | 254 | Explicit wallet adapter |

Highload preparation can use an external sender account. Automatic Highload signing
requires a `walletAdapter` implementing the exported adapter contract.

A grouped message list does not guarantee atomic execution across recipient
contracts.

## Payment networks

| Method | Network | Asset |
|:--|:--|:--|
| `ton`, `gram` | TON | TON |
| `usdt_ton`, `usdt_gram` | TON | USDT |
| `usdt_eth` | Ethereum | USDT |
| `usdt_pol` | Polygon | USDT |
| `usdc_eth` | Ethereum | USDC |
| `usdc_base` | Base | USDC |
| `usdc_pol` | Polygon | USDC |

Ads and Gateway recharge flows use native TON.

## Version 3 migration

- Cookies are optional; absence selects restricted wallet authentication.
- Purchases can return unsigned preparations.
- Batches process invoices independently instead of merging unrelated invoices.
- `confirmed` is not inferred from balance or sequence changes.
- `refreshCookies()` performs wallet proof without silently starting Telegram OAuth.
- Call `close()` in `finally`.
- Timeout values use milliseconds.
- File storage uses SHA-256 filenames; migrate old session files explicitly.
- Storage errors are propagated.
- EVM raw amounts and native base-unit fields are strings.
- `showSender` is honored consistently in single and batch purchases.

## Documentation

- [Client and authentication](https://github.com/S1qwy/fragment-api-ts/wiki/Client-and-Authentication)
- [Purchases and giveaways](https://github.com/S1qwy/fragment-api-ts/wiki/Purchases-and-Giveaways)
- [Marketplace and search](https://github.com/S1qwy/fragment-api-ts/wiki/Marketplace-and-Search)
- [Asset management](https://github.com/S1qwy/fragment-api-ts/wiki/Asset-Management)
- [Data models](https://github.com/S1qwy/fragment-api-ts/wiki/Data-Models)
- [Exceptions and limits](https://github.com/S1qwy/fragment-api-ts/wiki/Exceptions-and-Limits)
- [Examples](examples/README.md)

## Operational boundaries

- Reuse clients and close owned resources.
- Protect cookies, mnemonics, OAuth tokens, login codes, and signed BOCs.
- Session storage is not encrypted.
- Coordinate payer access across clients and processes.
- Keep durable invoice and submission reconciliation records.
- Fragment's private endpoints and HTML can change independently of this SDK.
- Node HTTPS does not reproduce curl_cffi browser TLS impersonation.
- Test provider responses and sanitized HTML fixtures before production rollout.

This project is not affiliated with Fragment, Telegram, or TON.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Support

[GitHub](https://github.com/S1qwy/fragment-api-ts) ·
[Issues](https://github.com/S1qwy/fragment-api-ts/issues) ·
[Telegram](https://t.me/fragment_api_lib)

MIT License.