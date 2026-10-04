import {
  makeClient, requireExecution, required, run, show, usingClient,
} from "./common";

const transaction = (): string => required("FRAGMENT_TRANSACTION");
const challenge = (): string => required("FRAGMENT_CONFIRM_HASH");

/*
 * Keep withdrawal initialization separate from approval submission.
 *
 * Each action requires explicit execution permission. Confirmation actions
 * consume the original reviewed challenge and opaque withdrawal state rather
 * than fetching and automatically approving a new challenge.
 */
async function withdrawal(
  operation: (client: ReturnType<typeof makeClient>) => Promise<unknown>
): Promise<void> {
  requireExecution();
  await usingClient(makeClient("prepare", true), async client => show(await operation(client)));
}

run({
  recipient: () => usingClient(makeClient("read", true), async client => {
    show(await client.searchNftTransferRecipient(required("FRAGMENT_TARGET")));
  }),
  transfer: () => usingClient(makeClient("pay", true), async client => {
    const recipient = await client.searchNftTransferRecipient(required("FRAGMENT_TARGET"));
    if (!recipient) throw new Error("Recipient not found.");
    const request = await client.initNftTransfer(required("FRAGMENT_SLUG"), recipient.recipient);
    show(await client.transferNft(request.reqId));
  }),
  nftInit: () => withdrawal(client => client.initNftWithdrawal(transaction())),
  nftConfirm: () => withdrawal(client => client.confirmNftWithdrawal(transaction(), challenge())),
  starsInit: () => withdrawal(async client => {
    const state = await client.getStarsWithdrawalState(transaction());
    return client.initStarsWithdrawal(state.transaction, state.withdrawalData);
  }),
  starsConfirm: () => withdrawal(client => client.confirmStarsWithdrawal(
    transaction(), required("FRAGMENT_WITHDRAWAL_DATA"), challenge()
  )),
  adsInit: () => withdrawal(client => client.initAdsWithdrawal(transaction())),
  adsConfirm: () => withdrawal(client => client.confirmAdsWithdrawal(transaction(), challenge())),
}, "recipient");