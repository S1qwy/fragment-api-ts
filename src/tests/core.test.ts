import test from "node:test";
import assert from "node:assert/strict";
import {
  ConfigurationError, FragmentClient, nativeFee, prepareTransaction,
} from "../src";
import { FEE_ADDRESS } from "../src/types/constants";
import {
  decimalUnits, normalizePaymentMethod, starsGiveaway,
} from "../src/utils/validation";
import {
  parseGiftFilters, parseGiftItems, parseLoginCode, parseStarsPriceFromHtml,
} from "../src/utils/html";
import { FragmentTransport, HttpSession } from "../src/utils/http";

test("exact currency conversion and fee rounding", () => {
  assert.equal(decimalUnits("1,000.000000001", 9), 1_000_000_000_001n);
  assert.throws(() => decimalUnits("0.0000000001", 9), ConfigurationError);
  assert.throws(() => decimalUnits(true, 9), ConfigurationError);
  assert.equal(nativeFee(0n), 0n);
  assert.equal(nativeFee(1n), 1n);
  assert.equal(nativeFee(200n), 1n);
  assert.equal(nativeFee(201n), 2n);
  assert.equal(normalizePaymentMethod(" USDT_GRAM "), "usdt_ton");
});

test("original giveaway limits", () => {
  starsGiveaway(500, 5);
  starsGiveaway(1_000_000, 10_000);
  assert.throws(() => starsGiveaway(500, 6));
  assert.throws(() => starsGiveaway(501, 1));
  assert.throws(() => starsGiveaway(500, true));
});

test("native fee excludes attached gas and source is not mutated", () => {
  const source = {
    transaction: {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: FEE_ADDRESS, amount: "1100000000" }],
    },
  };
  const result = prepareTransaction(source, {
    paymentMethod: "ton",
    paymentNanoton: 1_000_000_000n,
    walletVersion: "V5R1",
    itemKind: "stars",
    target: "example",
    amount: 100,
    gasReserveNanoton: 50_000_000n,
  });
  assert.equal(result.feeNanoton, "5000000");
  assert.equal(result.requiredNanoton, "1155000000");
  assert.equal(result.messages.length, 2);
  assert.equal(source.transaction.messages.length, 1);
});

test("USDT has no percentage fee", () => {
  const result = prepareTransaction({
    transaction: { messages: [{ address: FEE_ADDRESS, amount: "100000000" }] },
  }, {
    paymentMethod: "usdt_ton",
    paymentNanoton: null,
    walletVersion: "V5R1",
    itemKind: "stars",
    target: "example",
    amount: 100,
  });
  assert.equal(result.feeNanoton, "0");
  assert.equal(result.messages.length, 1);
});

test("fee message consumes V4 capacity", () => {
  assert.throws(() => prepareTransaction({
    transaction: {
      messages: Array.from({ length: 4 }, () => ({
        address: FEE_ADDRESS, amount: "1000000000",
      })),
    },
  }, {
    paymentMethod: "ton",
    paymentNanoton: 1_000_000_000n,
    walletVersion: "V4R2",
    itemKind: "stars",
    target: "example",
    amount: 100,
  }));
});

test("nested decimal and responsive gift status", () => {
  assert.deepEqual(parseStarsPriceFromHtml(`
    <span class="icon-ton">1,234<span>.000000001</span></span>
    <span>&#036;5.25</span>
  `), ["1234.000000001", "5.25"]);
  const [items, cursor] = parseGiftItems(`
    <a class="tm-grid-item" href="/gift/test-1">
      <span class="item-name">Test</span><span class="item-num">1</span>
      <div class="tm-grid-item-status">
        <span class="narrow-only">Auction</span>
        <span class="wide-only">On auction</span>
      </div>
      <div class="icon-ton">1.123456789</div>
    </a>
    <div data-next-offset="25"></div>
  `);
  assert.equal(items[0].status, "On auction");
  assert.equal(items[0].price, "1.123456789");
  assert.equal(items[0].name, "Test #1");
  assert.equal(cursor, 25);
});

test("bare login rows preserve numeric code", () => {
  assert.deepEqual(parseLoginCode(`
    <tr><td><div class="table-cell-value">No code</div></td></tr>
    <tr><td><div class="table-cell-value">12 345</div></td></tr>
  `), ["12345", 2]);
});

test("gift filters merge duplicate metadata", () => {
  const result = parseGiftFilters(`
    <a class="js-choose-collection-item" data-value="test" data-keywords="Test">
      <span class="tm-main-filters-count">10</span>
      <img src="https://example.com/test.png">
    </a>
    <a class="js-choose-collection-item" data-value="test">
      <span class="tm-popup-filters-desc">20 items</span>
    </a>
  `);
  assert.equal(result.collections[0].count, 20);
  assert.equal(result.collections[0].name, "Test");
  assert.equal(result.collections[0].imageUrl, "https://example.com/test.png");
});

test("restricted account access fails without network", async () => {
  const client = new FragmentClient();
  try {
    await assert.rejects(client.getProfile(), ConfigurationError);
    await assert.rejects(client.getSessions(), ConfigurationError);
    await assert.rejects(client.getMyAssets(), ConfigurationError);
    await assert.rejects(client.getLoginCode("88812345678"), ConfigurationError);
    await assert.rejects(
      client.call("tonTerminateSession", { session_id: "example" }),
      ConfigurationError
    );
  } finally {
    await client.close();
  }
});

test("explicit API method wins over payload method", async () => {
  const session = new HttpSession(["https://fragment.com"]);
  const transport = new FragmentTransport(session);
  let body = "";
  transport.hash = async () => "hash";
  session.request = async (_url, options) => {
    body = options?.body ?? "";
    return { status: 200, text: '{"ok":true}', headers: {} };
  };
  await transport.call("searchAuctions", { method: "tonTerminateSession" });
  assert.equal(new URLSearchParams(body).get("method"), "searchAuctions");
  await session.close();
});