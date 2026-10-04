import { ConfigurationError, FragmentClient } from "../src";
import { makeClient, run, usingClient } from "./common";

run({
  restrictions: () => usingClient(new FragmentClient(), async client => {
    try { await client.getProfile(); }
    catch (error) {
      if (!(error instanceof ConfigurationError)) throw error;
      console.log("Private profile access is blocked in restricted mode.");
    }
  }),
  validation: () => usingClient(new FragmentClient(), async client => {
    for (const operation of [
      () => client.purchaseStars("example", 1),
      () => client.purchasePremium("example", 5),
      () => client.giveawayStars("example", 6, 500),
    ]) {
      try { await operation(); }
      catch (error) {
        if (!(error instanceof ConfigurationError)) throw error;
        console.log("Invalid input rejected before network access.");
      }
    }
  }),
  raw: () => usingClient(makeClient(), async client => {
    const result = await client.call("searchAuctions", {
      type: "usernames", query: "", sort: "price_asc",
    });
    console.log({ responseKeys: Object.keys(result), hasError: Boolean(result.error) });
  }),
}, "restrictions");