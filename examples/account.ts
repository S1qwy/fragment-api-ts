import {
  makeClient, requireExecution, required, run, setting, show, usingClient,
} from "./common";

run({
  wallet: () => usingClient(makeClient("wallet"), async client => show(await client.getWallet())),
  profile: () => usingClient(makeClient("read", true), async client => show(await client.getProfile())),
  sessions: () => usingClient(makeClient("read", true), async client => show(await client.listSessions())),
  assets: () => usingClient(makeClient("read", true), async client => {
    show(await client.getMyAssets(setting("FRAGMENT_CATEGORY", "usernames")));
  }),
  bids: () => usingClient(makeClient("read", true), async client => {
    show(await client.getMyBids(setting("FRAGMENT_CATEGORY", "usernames")));
  }),
  starsHistory: () => usingClient(makeClient("read", true), async client => show(await client.getStarsHistory())),
  premiumHistory: () => usingClient(makeClient("read", true), async client => show(await client.getPremiumHistory())),
  topupHistory: () => usingClient(makeClient("read", true), async client => show(await client.getTopupHistory())),
  terminate: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => {
      show(await client.terminateSession(required("FRAGMENT_TERMINATE_SESSION_ID")));
    });
  },
  refresh: async () => {
    requireExecution();
    await usingClient(makeClient("prepare", true), async client => {
      await client.refreshCookies();
      console.log("Wallet proof refreshed.");
    });
  },
}, "profile");