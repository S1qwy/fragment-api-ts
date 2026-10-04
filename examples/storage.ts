import {
  CookieError, FileSessionStorage, FragmentClient, RedisSessionStorage,
  type SessionStorage,
} from "../src";
import { run, setting, usingClient } from "./common";

async function use(storage: SessionStorage): Promise<void> {
  const sessionId = setting("FRAGMENT_SESSION_ID", "default");
  const cookies = await storage.load(sessionId);
  if (!cookies) throw new CookieError("Session missing. Run authentication first.");
  await usingClient(new FragmentClient({
    cookies, sessionStorage: storage, sessionId,
  }), async client => {
    const profile = await client.getProfile();
    console.log(`Authenticated profile: ${profile.name}`);
  });
}

run({
  files: () => use(new FileSessionStorage(
    setting("FRAGMENT_SESSION_DIR", ".fragment_sessions")
  )),
  redis: async () => {
    const storage = new RedisSessionStorage(
      setting("REDIS_URL", "redis://localhost:6379/0"), "fragment:session:", 3600
    );
    try { await use(storage); }
    finally { await storage.close(); }
  },
}, "files");