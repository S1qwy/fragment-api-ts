import {
  BroadcastUncertainError, ConfigurationError, FragmentClient, FragmentError,
  type FragmentClientOptions,
} from "../src";

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError(`Set ${name}.`);
  return value;
}

export function setting(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function requireExecution(): void {
  if (!process.argv.includes("--execute")) {
    throw new ConfigurationError("This action can spend funds or change state. Add --execute.");
  }
}

export function quantity(name: string, fallback?: number): number {
  const raw = process.env[name];
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(required(name));
  if (!Number.isSafeInteger(value)) throw new ConfigurationError(`${name} must be an integer.`);
  return value;
}

/*
 * Build an example client without accidentally enabling automatic payments.
 *
 * Read mode omits payer credentials. Prepare mode omits the provider key.
 * Pay mode requires explicit command-line approval and both payer credentials.
 * Account mode requires user-owned cookies before constructing the client.
 */
export function makeClient(
  mode: "read" | "prepare" | "wallet" | "pay" = "read",
  account = false,
  overrides: FragmentClientOptions = {}
): FragmentClient {
  const cookies = process.env.FRAGMENT_COOKIES;
  if (account && !cookies) throw new ConfigurationError("Set FRAGMENT_COOKIES.");
  const options: FragmentClientOptions = {
    cookies,
    apiProvider: setting("TON_API_PROVIDER", "tonapi"),
    walletVersion: setting("TON_WALLET_VERSION", "V5R1"),
    proxy: process.env.FRAGMENT_PROXY,
    sharedAuthSeed: process.env.FRAGMENT_SHARED_AUTH_SEED,
  };
  if (mode === "pay") requireExecution();
  if (mode === "wallet" || mode === "pay") {
    options.seed = required("TON_SEED");
    options.apiKey = required("TON_API_KEY");
  } else if (mode === "prepare") {
    const sender = process.env.TON_SENDER_ACCOUNT;
    if (sender) options.senderAccount = JSON.parse(sender);
    else options.seed = required("TON_SEED");
  }
  return new FragmentClient({ ...options, ...overrides });
}

export async function usingClient(
  client: FragmentClient,
  operation: (client: FragmentClient) => Promise<void>
): Promise<void> {
  try { await operation(client); }
  finally { await client.close(); }
}

/*
 * Print a credential-conscious result summary.
 *
 * Transaction BOCs and raw invoice source data are excluded. Login code results
 * are summarized by availability rather than by their secret value. General
 * account output should still be treated as private application information.
 */
export function show(result: unknown): void {
  if (!result || typeof result !== "object") {
    console.log(result);
    return;
  }
  const value = result as Record<string, unknown>;
  if ("code" in value && "activeSessions" in value) {
    console.log({ codeAvailable: value.code !== null, activeSessions: value.activeSessions });
  } else if ("preparedTransactions" in value) {
    console.log({
      total: value.total, accepted: value.succeeded,
      failed: value.failed, broadcasts: value.chunksSent,
      items: (value.items as Array<Record<string, unknown>>).map(item => ({
        index: item.chunkIndex, type: item.type, status: item.status, error: item.error,
      })),
    });
  } else if ("messages" in value) {
    console.log({
      status: "prepared", reqId: value.reqId,
      sender: value.senderAddress,
      messages: (value.messages as unknown[]).length,
      feeNanoton: value.feeNanoton,
      requiredNanoton: value.requiredNanoton,
      validUntil: value.validUntil,
    });
  } else if ("invoice" in value) {
    const invoice = value.invoice as Record<string, unknown>;
    console.log({
      status: "invoice", reqId: invoice.reqId,
      chain: invoice.invoiceChainId, token: invoice.invoiceToken,
      destination: invoice.invoiceAddress, rawAmount: invoice.invoiceAmountRaw,
      decimals: invoice.tokenDecimals, expiresAt: invoice.expiresAt,
    });
  } else if ("transactionId" in value || "txHash" in value) {
    console.log({
      identifier: value.transactionId ?? value.txHash,
      confirmed: value.confirmed, confirmationError: value.confirmationError,
    });
  } else {
    console.log(result);
  }
}

export function run(
  actions: Record<string, () => Promise<void>>,
  fallback: string
): void {
  if (process.argv.includes("--help")) {
    console.log(`Actions: ${Object.keys(actions).join(", ")}`);
    console.log("Payments and mutations require --execute.");
    return;
  }
  const action = process.argv.slice(2).find(value => !value.startsWith("--")) ?? fallback;
  if (!Object.hasOwn(actions, action)) {
    console.error("Unknown action.");
    process.exitCode = 1;
    return;
  }
  actions[action]().catch(error => {
    if (error instanceof BroadcastUncertainError) {
      console.error("Submission outcome unknown. Reconcile before another payment.", {
        reqId: error.reqId, txHash: error.txHash,
      });
      process.exitCode = 2;
    } else {
      console.error(error instanceof FragmentError ? error.name : "OperationError");
      process.exitCode = 1;
    }
  });
}