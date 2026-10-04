import { FileSessionStorage, FragmentClient } from "../src";
import { required, run, setting } from "./common";

/*
 * Run explicit interactive authentication and persist its resulting cookies.
 *
 * Cookie values and OAuth result tokens are not printed. QR links are displayed
 * only as part of the interactive authentication flow requested by this script.
 */
async function login(phone?: string): Promise<void> {
  const cookies = await FragmentClient.authenticate({
    seed: required("TON_SEED"),
    walletVersion: setting("TON_WALLET_VERSION", "V5R1"),
    phone,
    printQr: !phone,
    proxy: process.env.FRAGMENT_PROXY,
    onStatus: status => {
      if (status !== "qr_link") console.log(`Authentication: ${status}`);
    },
  });
  await new FileSessionStorage(
    setting("FRAGMENT_SESSION_DIR", ".fragment_sessions")
  ).save(setting("FRAGMENT_SESSION_ID", "default"), cookies, { mode: "cookies" });
  console.log("Session saved.");
}

run({
  qr: () => login(),
  phone: () => login(required("TELEGRAM_PHONE")),
}, "qr");