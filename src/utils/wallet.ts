import {
  Address, beginCell, Cell, external, internal, loadMessage,
  loadStateInit, SendMode, storeMessage, storeStateInit,
} from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, WalletContractV5R1 } from "@ton/ton";
import {
  BroadcastUncertainError, ConfigurationError, TransactionError, WalletError,
} from "../exceptions";
import {
  BASIS_POINTS_DENOMINATOR, FEE_ADDRESS, FEE_BASIS_POINTS,
  GAS_RESERVE_NANOTON, TONAPI_BASE_URL, TONCENTER_BASE_URL,
  USDT_TON_MASTER_ADDRESS, WALLET_MAX_MESSAGES,
} from "../types/constants";
import type {
  ApiObject, ApiProvider, PreparedTransaction, PreparedTransactionMessage,
  SenderAccount, TransactionResult, WalletInfo, WalletVersion,
} from "../types/results";
import { Mutex } from "./async";
import { decodeBoc } from "./decoder";
import { HttpSession } from "./http";
import {
  decimalUnits, formatUnits, integer, isObject, normalizePaymentMethod,
  object, text, validateSeed,
} from "./validation";

export interface WalletAdapter {
  deriveAccount(seed: string): Promise<SenderAccount>;
  signExternal(params: {
    seed: string;
    prepared: PreparedTransaction;
    provider: BlockchainProvider;
  }): Promise<string>;
}

export interface WalletConfiguration {
  seed: string | null;
  apiKey: string | null;
  apiProvider: ApiProvider;
  walletVersion: WalletVersion;
  timeout: number;
  adapter?: WalletAdapter;
}

interface AccountState {
  balance: bigint;
  state: string;
}

export class BlockchainProvider {
  private readonly session: HttpSession;

  constructor(
    readonly provider: ApiProvider,
    private readonly apiKey: string,
    timeout: number
  ) {
    this.session = new HttpSession(
      ["https://tonapi.io", "https://toncenter.com"], timeout
    );
  }

  /*
   * Execute a provider request using the selected provider's actual protocol.
   *
   * Tonapi uses REST and Bearer authorization. Toncenter uses JSON-RPC and
   * X-API-Key. Neither path automatically retries a sendBoc request.
   */
  private async request(
    method: string,
    parameters: ApiObject = {},
    tonapiPath?: string,
    tonapiBody?: ApiObject
  ): Promise<ApiObject> {
    const tonapi = this.provider === "tonapi";
    const response = await this.session.request(
      tonapi ? `${TONAPI_BASE_URL}${tonapiPath}` : TONCENTER_BASE_URL,
      {
        method: tonapi && tonapiBody === undefined ? "GET" : "POST",
        headers: tonapi
          ? {
              authorization: `Bearer ${this.apiKey}`,
              "content-type": "application/json",
            }
          : {
              "X-API-Key": this.apiKey,
              "content-type": "application/json",
            },
        body: tonapi
          ? tonapiBody === undefined ? undefined : JSON.stringify(tonapiBody)
          : JSON.stringify({ jsonrpc: "2.0", id: "1", method, params: parameters }),
      }
    );
    if (response.status !== 200) {
      throw new WalletError(`Blockchain provider returned HTTP ${response.status}.`);
    }
    let result: ApiObject;
    try { result = object(JSON.parse(response.text)); }
    catch { throw new WalletError("Blockchain provider returned invalid JSON."); }
    if (result.error || result.ok === false) {
      throw new WalletError("Blockchain provider rejected the request.");
    }
    if (tonapi) return result;
    if (isObject(result.result)) return result.result;
    return { value: result.result };
  }

  async info(address: string): Promise<AccountState> {
    const raw = Address.parse(address).toRawString();
    const result = await this.request(
      "getAddressInformation",
      { address: raw },
      `/blockchain/accounts/${encodeURIComponent(raw)}`
    );
    return {
      balance: decimalUnits(result.balance, 0),
      state: text(
        this.provider === "tonapi" ? result.status : result.state,
        "unknown"
      ),
    };
  }

  /*
   * Read a get-method stack without converting integer values into floats.
   *
   * The methods used here require only integer and cell/slice stack entries.
   * Unsupported stack layouts fail explicitly instead of supplying defaults
   * that could authorize a payment with an incorrect balance or sequence.
   */
  async run(
    address: string,
    method: string,
    argument?: Cell
  ): Promise<unknown[]> {
    const raw = Address.parse(address).toRawString();
    const query = argument
      ? `?args=${encodeURIComponent(argument.toBoc().toString("hex"))}`
      : "";
    const result = await this.request(
      "runGetMethod",
      {
        address: raw,
        method,
        stack: argument
          ? [["tvm.Slice", argument.toBoc().toString("base64")]]
          : [],
      },
      `/blockchain/accounts/${encodeURIComponent(raw)}/methods/${encodeURIComponent(method)}${query}`
    );
    const exit = result.exit_code;
    if (
      (exit !== undefined && exit !== 0 && exit !== 1) ||
      result.success === false ||
      !Array.isArray(result.stack)
    ) throw new WalletError("Blockchain get-method failed.");
    return result.stack;
  }

  stackInteger(entry: unknown): bigint {
    if (Array.isArray(entry)) {
      const value = text(entry[1]);
      return value.startsWith("-0x")
        ? -BigInt(`0x${value.slice(3)}`)
        : BigInt(value);
    }
    const value = object(entry);
    const raw = text(value.num);
    return raw.startsWith("-0x") ? -BigInt(`0x${raw.slice(3)}`) : BigInt(raw);
  }

  stackCell(entry: unknown): Cell {
    let encoded: string;
    if (Array.isArray(entry)) {
      encoded = isObject(entry[1])
        ? text(entry[1].bytes)
        : text(entry[1]);
    } else {
      const value = object(entry);
      encoded = text(value.cell ?? value.slice);
    }
    if (/^(?:[0-9a-fA-F]{2})+$/.test(encoded)) {
      const cells = Cell.fromBoc(Buffer.from(encoded, "hex"));
      if (cells.length !== 1) throw new WalletError("Invalid provider cell.");
      return cells[0];
    }
    return decodeBoc(encoded);
  }

  async seqno(address: string): Promise<number> {
    const state = await this.info(address);
    if (["uninit", "uninitialized", "nonexist"].includes(state.state)) return 0;
    const stack = await this.run(address, "seqno");
    return integer(Number(this.stackInteger(stack[0])), 0, 0xffffffff);
  }

  async usdtUnits(owner: string): Promise<bigint> {
    const argument = beginCell().storeAddress(Address.parse(owner)).endCell();
    const stack = await this.run(
      USDT_TON_MASTER_ADDRESS, "get_wallet_address", argument
    );
    const jetton = this.stackCell(stack[0]).beginParse().loadAddress();
    const state = await this.info(jetton.toRawString());
    if (["uninit", "uninitialized", "nonexist"].includes(state.state)) return 0n;
    const data = await this.run(jetton.toRawString(), "get_wallet_data");
    return this.stackInteger(data[0]);
  }

  async sendBoc(boc: string): Promise<void> {
    await this.request("sendBoc", { boc }, "/blockchain/message", { boc });
  }

  async close(): Promise<void> {
    await this.session.close();
  }
}

/*
 * Derive a built-in wallet or delegate to a supplied contract adapter.
 *
 * The shared authentication wallet is handled by the caller and is never
 * selected here as an automatic payer. Highload signing is deliberately an
 * explicit integration boundary rather than an unverified contract wrapper.
 */
export async function deriveAccount(
  seedValue: string,
  version: WalletVersion,
  adapter?: WalletAdapter
): Promise<SenderAccount> {
  const seed = await validateSeed(seedValue);
  if (adapter) return validateSenderAccount(await adapter.deriveAccount(seed));
  const keyPair = await mnemonicToPrivateKey(seed.split(" "));
  const wallet = createBuiltin(version, keyPair.publicKey);
  return {
    address: wallet.address.toRawString(),
    chain: "-239",
    publicKey: keyPair.publicKey.toString("hex"),
    walletStateInit: beginCell()
      .store(storeStateInit(wallet.init))
      .endCell().toBoc().toString("base64"),
  };
}

function createBuiltin(version: WalletVersion, publicKey: Buffer) {
  if (version === "V4R2") {
    return WalletContractV4.create({ publicKey, workchain: 0 });
  }
  if (version === "V5R1") {
    return WalletContractV5R1.create({ publicKey, workchain: 0 });
  }
  throw new ConfigurationError(`${version} requires a walletAdapter.`);
}

export function validateSenderAccount(value: unknown): SenderAccount {
  const account = object(value, "Sender account");
  if (
    account.chain !== "-239" ||
    typeof account.address !== "string" ||
    typeof account.publicKey !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(account.publicKey) ||
    typeof account.walletStateInit !== "string"
  ) throw new ConfigurationError("A complete mainnet TON Connect account is required.");
  const address = Address.parse(account.address);
  const init = loadStateInit(decodeBoc(account.walletStateInit).beginParse());
  const hash = beginCell().store(storeStateInit(init)).endCell().hash();
  if (!hash.equals(address.hash)) {
    throw new ConfigurationError("Sender StateInit does not match its address.");
  }
  return {
    address: address.toRawString(),
    chain: "-239",
    publicKey: account.publicKey,
    walletStateInit: account.walletStateInit,
  };
}

export function nativeFee(principal: bigint): bigint {
  if (typeof principal !== "bigint" || principal < 0n) {
    throw new ConfigurationError("Principal must be nonnegative bigint nanotons.");
  }
  return (
    principal * FEE_BASIS_POINTS + BASIS_POINTS_DENOMINATOR - 1n
  ) / BASIS_POINTS_DENOMINATOR;
}

/*
 * Prepare the complete unsigned invoice without modifying server source data.
 *
 * The native library fee is ceil(principal * 0.005) and excludes attached gas.
 * USDT invoices do not receive a native percentage fee. All outgoing messages,
 * including the fee, count toward capacity and remain in their original order.
 * Grouped messages are not a promise of atomic recipient-contract execution.
 */
export function prepareTransaction(
  transactionData: ApiObject,
  options: {
    paymentMethod: string;
    paymentNanoton: bigint | null;
    walletVersion: WalletVersion;
    itemKind: string;
    target: string;
    amount: number;
    reqId?: string;
    senderAddress?: string | null;
    confirmReferer?: string | null;
    gasReserveNanoton?: bigint;
    requiredUsdtUnits?: bigint | null;
  }
): PreparedTransaction {
  const method = normalizePaymentMethod(options.paymentMethod);
  if (method !== "ton" && method !== "usdt_ton") {
    throw new ConfigurationError("EVM payments use external invoices.");
  }
  const raw = structuredClone(transactionData);
  const inner = object(raw.transaction, "Transaction");
  if (!Array.isArray(inner.messages) || !inner.messages.length) {
    throw new TransactionError("Transaction messages are missing.");
  }
  const messages: PreparedTransactionMessage[] = inner.messages.map(value => {
    const message = object(value, "Transaction message");
    const address = text(message.address);
    Address.parse(address);
    const payload = message.payload == null ? null : text(message.payload);
    const stateInit = message.stateInit ?? message.state_init;
    if (payload) decodeBoc(payload);
    if (stateInit != null) loadStateInit(decodeBoc(text(stateInit)).beginParse());
    return {
      address,
      amount: decimalUnits(message.amount, 0).toString(),
      payload,
      stateInit: stateInit == null ? null : text(stateInit),
    };
  });
  const reserve = options.gasReserveNanoton ?? GAS_RESERVE_NANOTON;
  if (typeof reserve !== "bigint" || reserve < 0n) {
    throw new ConfigurationError("Gas reserve must be nonnegative bigint nanotons.");
  }
  const principal = method === "ton" ? options.paymentNanoton : 0n;
  if (principal === null) throw new TransactionError("Exact native principal is missing.");
  const fee = method === "ton" ? nativeFee(principal) : 0n;
  const attached = messages.reduce((sum, message) => sum + BigInt(message.amount), 0n);
  if (principal > attached) {
    throw new TransactionError("Principal exceeds attached native value.");
  }
  if (fee) messages.push({ address: FEE_ADDRESS, amount: fee.toString() });
  if (messages.length > WALLET_MAX_MESSAGES[options.walletVersion]) {
    throw new TransactionError("Invoice exceeds wallet message capacity including fee.");
  }
  const validUntil = integer(
    inner.validUntil ?? inner.valid_until ?? Math.floor(Date.now() / 1000) + 300,
    1, 0xffffffff, "Invalid transaction expiration."
  );
  if (validUntil <= Math.floor(Date.now() / 1000)) {
    throw new TransactionError("Transaction has expired.");
  }
  if (inner.network != null && String(inner.network) !== "-239") {
    throw new TransactionError("Only mainnet transactions are supported.");
  }
  const sender = inner.from == null ? options.senderAddress ?? null : text(inner.from);
  if (
    sender && options.senderAddress &&
    !Address.parse(sender).equals(Address.parse(options.senderAddress))
  ) throw new TransactionError("Invoice sender differs from requested sender.");
  return {
    status: "prepared",
    reqId: options.reqId ?? "",
    itemKind: options.itemKind,
    target: options.target,
    amount: options.amount,
    validUntil,
    messages,
    raw,
    senderAddress: sender,
    confirmReferer: options.confirmReferer ?? null,
    paymentMethod: method,
    paymentNanoton: principal.toString(),
    feeNanoton: fee.toString(),
    gasReserveNanoton: reserve.toString(),
    requiredNanoton: (attached + fee + reserve).toString(),
    requiredUsdtUnits: options.requiredUsdtUnits?.toString() ?? null,
  };
}

export class WalletRuntime {
  private readonly lock = new Mutex();
  private pending: { seqno: number; reqId: string; txHash: string } | null = null;
  private readonly provider: BlockchainProvider;

  constructor(private readonly configuration: WalletConfiguration) {
    if (!configuration.seed || !configuration.apiKey) {
      throw new ConfigurationError("Automatic payment requires seed and API key.");
    }
    this.provider = new BlockchainProvider(
      configuration.apiProvider, configuration.apiKey, configuration.timeout
    );
  }

  async info(): Promise<WalletInfo> {
    const account = await deriveAccount(
      this.configuration.seed!,
      this.configuration.walletVersion,
      this.configuration.adapter
    );
    const state = await this.provider.info(account.address);
    let usdt: number | null = null;
    try {
      usdt = Number(formatUnits(await this.provider.usdtUnits(account.address), 6));
    } catch {
      usdt = null;
    }
    const balance = Number(formatUnits(state.balance, 9));
    return {
      address: Address.parse(account.address).toString({ bounceable: false }),
      state: state.state,
      gramBalance: balance,
      balanceTon: balance,
      usdtBalance: usdt,
      balanceUsdt: usdt,
      balanceNanoton: state.balance.toString(),
    };
  }

  /*
   * Sign and submit a prepared invoice exactly once under a local wallet lock.
   *
   * Signing happens before the submission uncertainty boundary. A transport
   * error after submission produces BroadcastUncertainError. Ordinary wallets
   * retain the submitted sequence and refuse another send until the provider
   * observes its advancement. This is sequencing, not fulfillment detection.
   */
  async execute(preparedValue: PreparedTransaction): Promise<TransactionResult> {
    return this.lock.run(async () => {
      const prepared = structuredClone(preparedValue);
      if (
        prepared.validUntil <= Math.floor(Date.now() / 1000) ||
        !prepared.messages.length ||
        prepared.messages.length > WALLET_MAX_MESSAGES[this.configuration.walletVersion]
      ) throw new TransactionError("Expired or oversized prepared transaction.");

      const seed = await validateSeed(this.configuration.seed);
      const account = await deriveAccount(
        seed, this.configuration.walletVersion, this.configuration.adapter
      );
      if (
        !prepared.senderAddress ||
        !Address.parse(prepared.senderAddress).equals(Address.parse(account.address))
      ) throw new TransactionError("Signing wallet differs from invoice sender.");

      const state = await this.provider.info(account.address);
      const required = prepared.messages.reduce(
        (sum, message) => sum + decimalUnits(message.amount, 0), 0n
      ) + decimalUnits(prepared.gasReserveNanoton, 0);
      if (state.balance < required) {
        throw new WalletError(`Insufficient TON: ${state.balance} < ${required} nanotons.`);
      }
      if (prepared.paymentMethod === "usdt_ton") {
        if (prepared.requiredUsdtUnits === null) {
          throw new TransactionError("Exact USDT invoice amount is missing.");
        }
        const available = await this.provider.usdtUnits(account.address);
        if (available < BigInt(prepared.requiredUsdtUnits)) {
          throw new WalletError("Insufficient USDT balance.");
        }
      }

      let boc: string;
      let seqno: number | undefined;
      if (this.configuration.adapter) {
        boc = await this.configuration.adapter.signExternal({
          seed, prepared, provider: this.provider,
        });
      } else {
        seqno = await this.provider.seqno(account.address);
        if (this.pending && seqno <= this.pending.seqno) {
          throw new BroadcastUncertainError(
            "A previous wallet submission remains unresolved.",
            this.pending.reqId, this.pending.txHash
          );
        }
        this.pending = null;
        const keyPair = await mnemonicToPrivateKey(seed.split(" "));
        const wallet = createBuiltin(this.configuration.walletVersion, keyPair.publicKey);
        const messages = prepared.messages.map(message => internal({
          to: Address.parse(message.address),
          value: BigInt(message.amount),
          bounce: false,
          body: message.payload ? decodeBoc(message.payload) : undefined,
          init: message.stateInit
            ? loadStateInit(decodeBoc(message.stateInit).beginParse())
            : undefined,
        }));
        const body = await wallet.createTransfer({
          seqno,
          secretKey: keyPair.secretKey,
          timeout: prepared.validUntil,
          messages,
          sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
        });
        const deployed = state.state === "active";
        boc = beginCell().store(storeMessage(external({
          to: wallet.address,
          init: deployed ? undefined : wallet.init,
          body,
        }))).endCell().toBoc().toString("base64");
      }

      const root = decodeBoc(boc);
      const message = loadMessage(root.beginParse());
      if (
        message.info.type !== "external-in" ||
        !message.info.dest.equals(Address.parse(account.address))
      ) throw new TransactionError("Adapter returned an invalid external destination.");

      const txHash = root.hash().toString("hex");
      if (seqno !== undefined) {
        this.pending = { seqno, reqId: prepared.reqId, txHash };
      }
      try {
        await this.provider.sendBoc(boc);
      } catch (error) {
        throw new BroadcastUncertainError(
          "Submission outcome is unknown; reconcile before paying again.",
          prepared.reqId, txHash, { cause: error }
        );
      }
      return {
        txHash,
        boc,
        status: "broadcast",
        confirmed: false,
        seqnoBefore: seqno,
        balanceBefore: Number(formatUnits(state.balance, 9)),
        paymentNanoton: prepared.paymentNanoton,
        feeNanoton: prepared.feeNanoton,
        confirmationError: null,
      };
    });
  }

  async close(): Promise<void> {
    await this.provider.close();
  }
}