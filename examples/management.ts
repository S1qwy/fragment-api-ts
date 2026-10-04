import {
  makeClient, quantity, requireExecution, required, run, show, usingClient,
} from "./common";

const type = (): number => quantity("FRAGMENT_ITEM_TYPE", 1);
const slug = (): string => required("FRAGMENT_SLUG");
const amount = (): number => quantity("FRAGMENT_TON_AMOUNT");

run({
  bid: () => usingClient(makeClient("pay", true), async client => show(await client.placeBid(type(), slug(), amount()))),
  offer: () => usingClient(makeClient("pay", true), async client => show(await client.makeOffer(type(), slug(), amount()))),
  auction: () => usingClient(makeClient("pay", true), async client => show(await client.startAuction(type(), slug(), amount()))),
  sell: () => usingClient(makeClient("pay", true), async client => show(await client.sellAsset(type(), slug(), amount()))),
  cancel: () => usingClient(makeClient("pay", true), async client => show(await client.cancelAuction(type(), slug()))),
  destinations: () => usingClient(makeClient("read", true), async client => show(await client.getAssignAccounts(type(), slug()))),
  assign: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => {
      show(await client.assignToTelegram(type(), slug(), required("FRAGMENT_ASSIGN_TO"), false));
    });
  },
  subscribe: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => show(await client.subscribeToItem(type(), slug())));
  },
  unsubscribe: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => show(await client.unsubscribeFromItem(type(), slug())));
  },
}, "destinations");