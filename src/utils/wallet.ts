import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";
import { WalletContractV4, WalletContractV5R1, TonClient, internal, beginCell, Cell, Address, toNano, fromNano, SendMode } from "@ton/ton";
import {
  CONFIRMATION_INTERVAL,
  CONFIRMATION_MAX_ATTEMPTS,
  MIN_GRAM_BALANCE,
  USDT_GRAM_MASTER_ADDRESS,
  TONAPI_BASE_URL,
  TONCENTER_BASE_URL,
} from "../types/constants";
import { TransactionResult, WalletInfo } from "../types/results";
import {
  ConfirmationTimeout,
  SeqnoError,
  TransactionError,
  WalletError,
  fmt,
} from "../exceptions";
import { decodeBocComment } from "./decoder";

import type { FragmentClient } from "../client";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTonClient(client: FragmentClient): TonClient {
  if (client.apiProvider === "toncenter") {
    return new TonClient({
      endpoint: TONCENTER_BASE_URL,
      apiKey: client.apiKey!,
    });
  }
  return new TonClient({
    endpoint: TONAPI_BASE_URL,
    apiKey: client.apiKey!,
  });
}

async function getKeyPair(seed: string): Promise<KeyPair> {
  const words = seed.trim().split(/\s+/);
  return mnemonicToPrivateKey(words);
}

function createWallet(client: FragmentClient, keyPair: KeyPair) {
  if (client.walletVersion === "V4R2") {
    return WalletContractV4.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });
  }
  return WalletContractV5R1.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });
}

async function getUsdtBalance(tonClient: TonClient, walletAddress: string): Promise<number> {
  try {
    const masterAddress = Address.parse(USDT_GRAM_MASTER_ADDRESS);
    const result = await tonClient.runMethod(masterAddress, "get_wallet_address", [
      { type: "slice", cell: beginCell().storeAddress(Address.parse(walletAddress)).endCell() },
    ]);
    const jettonWalletAddress = result.stack.readAddress();

    const walletData = await tonClient.runMethod(jettonWalletAddress, "get_wallet_data");
    const balance = walletData.stack.readBigNumber();
    return Number(balance) / 1_000_000;
  } catch (exc: any) {
    if (exc?.message?.includes("404") || exc?.message?.includes("not found")) {
      return 0.0;
    }
    throw new WalletError(fmt(WalletError.USDT_BALANCE_CHECK_FAILED, { exc: String(exc) }));
  }
}

async function waitConfirmation(
  tonClient: TonClient,
  walletAddress: Address,
  walletContract: any,
  initialSeqno: number,
  initialBalance: number
): Promise<[boolean, number | null, number | null]> {
  for (let attempt = 0; attempt < CONFIRMATION_MAX_ATTEMPTS; attempt++) {
    await sleep(CONFIRMATION_INTERVAL);
    try {
      const currentSeqno = await walletContract.getSeqno(tonClient.provider(walletAddress));
      const balanceNano = await tonClient.getBalance(walletAddress);
      const currentBalance = Number(fromNano(balanceNano));

      if (currentSeqno > initialSeqno && currentBalance < initialBalance) {
        return [true, currentSeqno, currentBalance];
      }
    } catch {
      continue;
    }
  }
  return [false, null, null];
}

function parseMessages(messages: Record<string, any>[]): {
  destinations: string[];
  amounts: bigint[];
  bodies: (Cell | string)[];
} {
  const destinations: string[] = [];
  const amounts: bigint[] = [];
  const bodies: (Cell | string)[] = [];

  for (const msg of messages) {
    destinations.push(msg.address);
    amounts.push(BigInt(msg.amount));

    const rawBoc = msg.payload || "";
    if (rawBoc) {
      try {
        const decoded = decodeBocComment(rawBoc);
        if (typeof decoded === "string") {
          bodies.push(decoded);
        } else {
          bodies.push(decoded);
        }
      } catch {
        let s = rawBoc.trim().replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4 !== 0) s += "=";
        const cell = Cell.fromBoc(Buffer.from(s, "base64"))[0];
        bodies.push(cell);
      }
    } else {
      bodies.push("");
    }
  }

  return { destinations, amounts, bodies };
}

async function runTransaction(
  client: FragmentClient,
  transactionData: Record<string, any>,
  skipBalanceCheck: boolean = false
): Promise<TransactionResult> {
  if (
    !transactionData.transaction ||
    !transactionData.transaction.messages ||
    transactionData.transaction.messages.length === 0
  ) {
    throw new TransactionError(TransactionError.INVALID_PAYLOAD);
  }

  const messages: Record<string, any>[] = transactionData.transaction.messages;
  const totalAmountGram =
    messages.reduce((sum, msg) => sum + Number(BigInt(msg.amount)), 0) / 1_000_000_000;
  const tonClient = makeTonClient(client);
  const keyPair = await getKeyPair(client.seed!);
  const wallet = createWallet(client, keyPair);
  const walletAddress = wallet.address;
  const walletContract = tonClient.open(wallet);

  if (!skipBalanceCheck) {
    try {
      const balanceNano = await tonClient.getBalance(walletAddress);
      const balanceGram = Number(fromNano(balanceNano));
      const required = totalAmountGram + MIN_GRAM_BALANCE;

      if (balanceGram < required) {
        throw new WalletError(
          fmt(WalletError.LOW_GRAM_BALANCE, {
            balance: balanceGram.toFixed(4),
            required: required.toFixed(4),
            gas: MIN_GRAM_BALANCE.toFixed(3),
          })
        );
      }
    } catch (exc) {
      if (exc instanceof WalletError) throw exc;
      throw new WalletError(fmt(WalletError.GRAM_BALANCE_CHECK_FAILED, { exc: String(exc) }));
    }
  }

  const { destinations, amounts, bodies } = parseMessages(messages);

  let initialSeqno: number;
  let initialBalance: number;
  try {
    initialSeqno = await walletContract.getSeqno();
    const balNano = await tonClient.getBalance(walletAddress);
    initialBalance = Number(fromNano(balNano));
  } catch (exc) {
    throw new SeqnoError(fmt(SeqnoError.FETCH_FAILED, { exc: String(exc) }));
  }

  let bocBase64 = "";
  let extMsgHash = "";

  try {
    const internalMessages = destinations.map((dest, i) => {
      const body =
        typeof bodies[i] === "string"
          ? bodies[i]
            ? beginCell().storeUint(0, 32).storeStringTail(bodies[i] as string).endCell()
            : undefined
          : (bodies[i] as Cell);

      return internal({
        to: Address.parse(dest),
        value: amounts[i],
        body: body,
        bounce: false,
      });
    });

    const transfer = (walletContract as any).createTransfer({
      seqno: initialSeqno,
      secretKey: keyPair.secretKey,
      messages: internalMessages,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    bocBase64 = transfer.toBoc().toString("base64");
    extMsgHash = transfer.hash().toString("hex");

    await walletContract.send(transfer);
  } catch (exc) {
    throw new TransactionError(fmt(TransactionError.BROADCAST_FAILED, { exc: String(exc) }));
  }

  const [confirmed, finalSeqno, finalBalance] = await waitConfirmation(
    tonClient,
    walletAddress,
    walletContract,
    initialSeqno,
    initialBalance
  );

  if (!confirmed) {
    throw new ConfirmationTimeout(
      fmt(ConfirmationTimeout.TIMEOUT, {
        seconds: Math.floor((CONFIRMATION_INTERVAL * CONFIRMATION_MAX_ATTEMPTS) / 1000),
        seqno_before: initialSeqno,
        balance_before: initialBalance.toFixed(4),
      })
    );
  }

  let txHash = extMsgHash;
  try {
    const txs = await tonClient.getTransactions(walletAddress, { limit: 1 });
    if (txs.length > 0) {
      txHash = txs[0].hash().toString("hex");
    }
  } catch {
  }

  return {
    txHash,
    boc: bocBase64,
    seqnoBefore: initialSeqno,
    seqnoAfter: finalSeqno,
    balanceBefore: initialBalance,
    balanceAfter: finalBalance,
    confirmed,
  };
}

/**
 * Execute a TON transaction with full balance check and confirmation.
 */
export async function executeTransaction(
  client: FragmentClient,
  transactionData: Record<string, any>
): Promise<TransactionResult> {
  return runTransaction(client, transactionData, false);
}

/**
 * Execute a batched TON transaction with multiple inline messages.
 * Balance is NOT checked here — the caller must verify it upfront.
 */
export async function executeBatchTransaction(
  client: FragmentClient,
  transactionData: Record<string, any>
): Promise<TransactionResult> {
  return runTransaction(client, transactionData, true);
}

/**
 * Build wallet account info dict for Fragment API requests.
 * Fragment needs the wallet address, public key, chain ID, and
 * state init to prepare transaction payloads.
 */
export async function buildAccountInfo(
  client: FragmentClient
): Promise<Record<string, any>> {
  try {
    const keyPair = await getKeyPair(client.seed!);
    const wallet = createWallet(client, keyPair);
    const stateInit = wallet.init;

    if (!stateInit) {
      throw new WalletError(fmt(WalletError.ACCOUNT_INFO_FAILED, { exc: "No state init" }));
    }

    const boc = beginCell()
      .store((b: any) => {
        b.storeRef(stateInit.code!);
        b.storeRef(stateInit.data!);
      })
      .endCell()
      .toBoc();

    return {
      address: wallet.address.toRawString(),
      publicKey: keyPair.publicKey.toString("hex"),
      chain: "-239",
      walletStateInit: boc.toString("base64"),
    };
  } catch (exc) {
    if (exc instanceof WalletError) throw exc;
    throw new WalletError(fmt(WalletError.ACCOUNT_INFO_FAILED, { exc: String(exc) }));
  }
}

/**
 * Fetch full wallet information including GRAM and USDT balances.
 */
export async function fetchWalletInfo(client: FragmentClient): Promise<WalletInfo> {
  try {
    const tonClient = makeTonClient(client);
    const keyPair = await getKeyPair(client.seed!);
    const wallet = createWallet(client, keyPair);
    const walletAddress = wallet.address;

    const balanceNano = await tonClient.getBalance(walletAddress);
    const gramBalance = Math.round(Number(fromNano(balanceNano)) * 10000) / 10000;

    const addressStr = walletAddress.toString({ bounceable: false, urlSafe: true });
    const usdtBalance = await getUsdtBalance(tonClient, addressStr);

    const stateStr = gramBalance > 0 ? "active" : "uninitialized";

    return {
      address: addressStr,
      state: stateStr,
      gramBalance,
      usdtBalance: Math.round(usdtBalance * 10000) / 10000,
    };
  } catch (exc) {
    if (exc instanceof WalletError) throw exc;
    throw new WalletError(fmt(WalletError.WALLET_INFO_FAILED, { exc: String(exc) }));
  }
}