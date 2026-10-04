import { makeClient, quantity, required, run, show, usingClient } from "./common";

run({
  recipient: () => usingClient(makeClient(), async client => {
    show(await client.getStarsRecipient(required("FRAGMENT_TARGET")));
  }),
  prepare: () => usingClient(makeClient("prepare"), async client => {
    show(await client.purchaseStars(required("FRAGMENT_TARGET"), quantity("FRAGMENT_AMOUNT", 100)));
  }),
  stars: () => usingClient(makeClient("pay"), async client => {
    show(await client.purchaseStars(required("FRAGMENT_TARGET"), quantity("FRAGMENT_AMOUNT", 100)));
  }),
  premium: () => usingClient(makeClient("pay"), async client => {
    show(await client.purchasePremium(required("FRAGMENT_TARGET"), quantity("FRAGMENT_MONTHS", 3)));
  }),
  usdt: () => usingClient(makeClient("pay"), async client => {
    show(await client.purchaseStars(required("FRAGMENT_TARGET"), 100, true, "usdt_ton"));
  }),
  hidden: () => usingClient(makeClient("pay"), async client => {
    show(await client.purchaseStars(required("FRAGMENT_TARGET"), 100, false));
  }),
  evm: () => usingClient(makeClient(), async client => {
    show(await client.purchaseStars(required("FRAGMENT_TARGET"), 100, true, "usdc_base"));
  }),
  batchPrepare: () => usingClient(makeClient("prepare"), async client => {
    show(await client.batchPurchase([
      { type: "stars", username: required("FRAGMENT_TARGET"), amount: 100 },
      { type: "premium", username: required("FRAGMENT_SECOND_TARGET"), months: 3 },
    ]));
  }),
  batch: () => usingClient(makeClient("pay"), async client => {
    show(await client.batchPurchase([
      { type: "stars", username: required("FRAGMENT_TARGET"), amount: 100 },
      { type: "premium", username: required("FRAGMENT_SECOND_TARGET"), months: 3 },
    ]));
  }),
  giveawayPrepare: () => usingClient(makeClient("prepare"), async client => {
    show(await client.giveawayStars(required("FRAGMENT_CHANNEL"), 10, 1000));
  }),
  giveawayStars: () => usingClient(makeClient("pay"), async client => {
    show(await client.giveawayStars(required("FRAGMENT_CHANNEL"), 10, 1000));
  }),
  giveawayPremium: () => usingClient(makeClient("pay"), async client => {
    show(await client.giveawayPremium(required("FRAGMENT_CHANNEL"), 5, 3));
  }),
  topup: () => usingClient(makeClient("pay"), async client => {
    show(await client.topupTon(required("FRAGMENT_TARGET"), quantity("FRAGMENT_TON_AMOUNT", 1)));
  }),
  gatewayQuote: () => usingClient(makeClient(), async client => {
    show(await client.getGatewayPrice(required("FRAGMENT_ACCOUNT_ID"), 100));
  }),
  gatewayPrepare: () => usingClient(makeClient("prepare"), async client => {
    show(await client.rechargeGateway(required("FRAGMENT_ACCOUNT_ID"), 100));
  }),
  gateway: () => usingClient(makeClient("pay"), async client => {
    show(await client.rechargeGateway(required("FRAGMENT_ACCOUNT_ID"), 100));
  }),
  ads: () => usingClient(makeClient("pay"), async client => {
    show(await client.rechargeAds(required("FRAGMENT_ACCOUNT_ID"), quantity("FRAGMENT_TON_AMOUNT", 1)));
  }),
}, "recipient");