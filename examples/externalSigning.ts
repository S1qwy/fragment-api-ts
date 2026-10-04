import { writeFile } from "node:fs/promises";
import {
  makeClient, requireExecution, required, run, setting, show, usingClient,
} from "./common";

/*
 * Export only the final unsigned transaction and its confirmation context.
 *
 * The file does not restore the original authenticated session. Keep that
 * session available separately, review every outgoing message, and sign with
 * the requested sender rather than substituting another wallet afterward.
 */
async function prepare(): Promise<void> {
  await usingClient(makeClient("prepare"), async client => {
    const result = await client.purchaseStars(required("FRAGMENT_TARGET"), 100);
    if (!("messages" in result)) throw new Error("Expected unsigned preparation.");
    await writeFile(
      setting("FRAGMENT_PREPARED_FILE", "prepared-transaction.json"),
      JSON.stringify({
        reqId: result.reqId,
        confirmReferer: result.confirmReferer,
        transaction: {
          validUntil: result.validUntil,
          from: result.senderAddress,
          network: "-239",
          messages: result.messages.map(message => Object.fromEntries(
            Object.entries(message).filter(([, value]) => value != null)
          )),
        },
      }, null, 2),
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    show(result);
    console.log("Preserve the original Fragment session for confirmation.");
  });
}

run({
  prepare,
  confirm: async () => {
    requireExecution();
    await usingClient(makeClient("read", true), async client => {
      const result = await client.confirmRequest(
        required("FRAGMENT_REQ_ID"),
        required("TON_SIGNED_BOC"),
        setting("FRAGMENT_CONFIRM_REFERER", "stars/buy")
      );
      console.log({ responseKeys: Object.keys(result) });
      console.log("BOC reporting alone is not fulfillment confirmation.");
    });
  },
}, "prepare");