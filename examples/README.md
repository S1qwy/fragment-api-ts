# Example Workspace

**Fragment API TypeScript · 3.0.0**

Run from the repository root:

`npx tsx examples/marketplace.ts prices`

List actions:

`npx tsx examples/purchases.ts --help`

Payment or mutation:

`npx tsx examples/purchases.ts stars --execute`

## Environment

| Variable | Purpose |
|:--|:--|
| FRAGMENT_COOKIES | Full account cookies as JSON or Cookie header |
| TON_SEED | Valid payer mnemonic |
| TON_API_KEY | Provider key |
| TON_API_PROVIDER | tonapi or toncenter |
| TON_WALLET_VERSION | V4R2 or V5R1 for built-in signing |
| TON_SENDER_ACCOUNT | Complete external sender account JSON |
| FRAGMENT_SHARED_AUTH_SEED | Restricted proof seed override |
| FRAGMENT_PROXY | Fragment/auth proxy |
| FRAGMENT_TARGET | Recipient username |
| FRAGMENT_SECOND_TARGET | Second batch recipient |
| FRAGMENT_CHANNEL | Giveaway channel |
| FRAGMENT_AMOUNT | Stars quantity |
| FRAGMENT_MONTHS | Premium duration |
| FRAGMENT_TON_AMOUNT | Whole TON amount |
| FRAGMENT_ACCOUNT_ID | Ads or Gateway account |
| FRAGMENT_QUERY | Marketplace query |
| FRAGMENT_COLLECTION | Gift collection |
| FRAGMENT_ATTRIBUTE | Model, Backdrop, or Symbol |
| FRAGMENT_ATTRIBUTE_VALUE | Exact filter value |
| FRAGMENT_SLUG | Asset identifier |
| FRAGMENT_ITEM_TYPE | 1, 3, or 5 |
| FRAGMENT_CATEGORY | usernames, numbers, or gifts |
| FRAGMENT_ASSIGN_TO | Assignment destination |
| FRAGMENT_NUMBER | User-owned anonymous number |
| FRAGMENT_SESSION_DIR | File storage directory |
| FRAGMENT_SESSION_ID | Storage identifier |
| FRAGMENT_TERMINATE_SESSION_ID | Exact session to terminate |
| TELEGRAM_PHONE | Interactive phone authentication |
| REDIS_URL | Redis URL |
| FRAGMENT_PREPARED_FILE | Unsigned export filename |
| FRAGMENT_REQ_ID | Original invoice request |
| TON_SIGNED_BOC | Already broadcast signed BOC |
| FRAGMENT_CONFIRM_REFERER | Original invoice page |
| FRAGMENT_TRANSACTION | Withdrawal identifier |
| FRAGMENT_WITHDRAWAL_DATA | Original withdrawal state |
| FRAGMENT_CONFIRM_HASH | Reviewed approval challenge |

The scripts do not automatically load .env files.

## Modes

Read mode omits payer credentials.

Prepare mode supplies a sender identity but omits the provider key.

Wallet mode configures credentials for balance inspection.

Pay mode requires --execute and both payer credentials.

## Safety and interpretation

- Prepared means not submitted.
- EVM invoices remain unpaid until an external integration pays them.
- Broadcast does not mean fulfilled.
- Inspect confirmed and confirmationError.
- Never automatically retry uncertain payments.
- Native payments include the documented 0.5% SDK principal fee.
- Keep the original session for external BOC reporting.
- File and Redis storage contain plaintext credentials.
- Do not fund the shared authentication wallet.
- Coordinate payer access across processes.
- JSON serialization of a login-code result still exposes its code.

These examples are not a production payment queue or reconciliation service.