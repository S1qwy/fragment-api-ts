import { makeClient, run, show, usingClient } from "./common";

run({
  read: () => usingClient(makeClient(), async client => show(client.toJSON())),
  payer: () => usingClient(makeClient("wallet"), async client => show(client.toJSON())),
  external: () => usingClient(makeClient("prepare"), async client => show(client.toJSON())),
}, "read");