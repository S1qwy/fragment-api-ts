import { makeClient, required, run, setting, show, usingClient } from "./common";

run({
  usernames: () => usingClient(makeClient(), async client => {
    show(await client.searchUsernames(setting("FRAGMENT_QUERY", ""), "price_asc", "sale"));
  }),
  numbers: () => usingClient(makeClient(), async client => {
    show(await client.searchNumbers(setting("FRAGMENT_QUERY", "888"), "price_asc"));
  }),
  gifts: () => usingClient(makeClient(), async client => {
    let cursor: number | null = null;
    const seen = new Set<number>();
    for (let page = 0; page < 3; page++) {
      const result = await client.searchGifts("", null, "price_asc", "sale", null, null, cursor);
      show(result);
      if (result.nextOffset === null || seen.has(result.nextOffset)) break;
      seen.add(result.nextOffset);
      cursor = result.nextOffset;
    }
  }),
  filters: () => usingClient(makeClient(), async client => {
    show(await client.getGiftFilters(required("FRAGMENT_COLLECTION")));
  }),
  filtered: () => usingClient(makeClient(), async client => {
    show(await client.searchGifts(
      "", required("FRAGMENT_COLLECTION"), "price_asc", null, null,
      { [setting("FRAGMENT_ATTRIBUTE", "Model")]: [required("FRAGMENT_ATTRIBUTE_VALUE")] }
    ));
  }),
  username: () => usingClient(makeClient(), async client => {
    show(await client.getUsernameInfo(required("FRAGMENT_TARGET")));
  }),
  number: () => usingClient(makeClient(), async client => {
    show(await client.getNumberInfo(required("FRAGMENT_NUMBER")));
  }),
  gift: () => usingClient(makeClient(), async client => {
    show(await client.getGiftInfo(required("FRAGMENT_SLUG")));
  }),
  history: () => usingClient(makeClient(), async client => {
    const target = required("FRAGMENT_TARGET");
    const info = await client.getUsernameInfo(target);
    if (info.bidHistoryNextOffset !== null) {
      const result = await client.getOrdersHistory(1, target, info.bidHistoryNextOffset);
      console.log(Object.keys(result));
    }
  }),
  prices: () => usingClient(makeClient(), async client => {
    show(await client.getStarsPrices());
    show(await client.getStarsPrice(1000));
    show(await client.getPremiumPrices());
  }),
}, "usernames");