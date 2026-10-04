import {
  makeClient, requireExecution, required, run, show, usingClient,
} from "./common";
import { setTimeout as sleep } from "node:timers/promises";

run({
  code: () => usingClient(makeClient("read", true), async client => {
    show(await client.getLoginCode(required("FRAGMENT_NUMBER")));
  }),
  poll: () => usingClient(makeClient("read", true), async client => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await client.getLoginCode(required("FRAGMENT_NUMBER"));
      if (result.code) {
        console.log("A login code is available. Handle it as a secret.");
        return;
      }
      await sleep(2000);
    }
    console.log("No code appeared within the polling window.");
  }),
  enable: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => {
      await client.toggleLoginCodes(required("FRAGMENT_NUMBER"), true);
      console.log("Code delivery enabled.");
    });
  },
  disable: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => {
      await client.toggleLoginCodes(required("FRAGMENT_NUMBER"), false);
      console.log("Code delivery disabled.");
    });
  },
  terminate: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => {
      show(await client.terminateSessions(required("FRAGMENT_NUMBER")));
    });
  },
}, "code");