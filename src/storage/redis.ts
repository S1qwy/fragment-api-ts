import { SessionStorage } from "./base";

/**
 * Store session cookies in Redis with optional TTL.
 * Requires `ioredis` package.
 */
export class RedisSessionStorage extends SessionStorage {
  private _redisUrl: string;
  private _prefix: string;
  private _ttl: number | null;
  private _redis: any;

  constructor(
    redisUrl: string = "redis://localhost:6379/0",
    prefix: string = "fragment:session:",
    ttl: number | null = null
  ) {
    super();
    this._redisUrl = redisUrl;
    this._prefix = prefix;
    this._ttl = ttl;
    this._redis = null;
  }

  private async _getRedis(): Promise<any> {
    if (!this._redis) {
      try {
        const Redis = (await import("ioredis")).default;
        this._redis = new Redis(this._redisUrl);
      } catch {
        throw new Error(
          "ioredis package is required for RedisSessionStorage. Install it with: npm install ioredis"
        );
      }
    }
    return this._redis;
  }

  private _key(sessionId: string): string {
    return `${this._prefix}${sessionId}`;
  }

  async save(sessionId: string, cookies: Record<string, string>, metadata?: Record<string, any> | null): Promise<void> {
    const r = await this._getRedis();
    const data = JSON.stringify({ cookies, metadata: metadata || {} });
    if (this._ttl) {
      await r.setex(this._key(sessionId), this._ttl, data);
    } else {
      await r.set(this._key(sessionId), data);
    }
  }

  async load(sessionId: string): Promise<Record<string, string> | null> {
    const r = await this._getRedis();
    const raw = await r.get(this._key(sessionId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.cookies || null;
  }

  async delete(sessionId: string): Promise<void> {
    try {
      const r = await this._getRedis();
      await r.del(this._key(sessionId));
    } catch {}
  }

  async exists(sessionId: string): Promise<boolean> {
    try {
      const r = await this._getRedis();
      return !!(await r.exists(this._key(sessionId)));
    } catch {
      return false;
    }
  }

  async loadMetadata(sessionId: string): Promise<Record<string, any> | null> {
    try {
      const r = await this._getRedis();
      const raw = await r.get(this._key(sessionId));
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data.metadata || null;
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this._redis) {
      await this._redis.quit();
      this._redis = null;
    }
  }
}