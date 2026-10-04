import type Redis from "ioredis";
import { SessionStorageError } from "../exceptions";
import type { ApiObject, Cookies } from "../types/results";
import { integer, object, parseCookies } from "../utils/validation";
import { SessionStorage } from "./base";

export class RedisSessionStorage extends SessionStorage {
  private connection: Promise<Redis> | null = null;
  private closed = false;

  constructor(
    private readonly url = "redis://localhost:6379/0",
    private readonly prefix = "fragment:session:",
    private readonly ttl: number | null = null
  ) {
    super();
    if (ttl !== null) integer(ttl, 1, 2_147_483_647, "TTL must be a positive integer.");
  }

  private async redis(): Promise<Redis> {
    if (this.closed) throw new SessionStorageError("Redis storage is closed.");
    if (!this.connection) {
      this.connection = (async () => {
        let Constructor: typeof Redis;
        try { Constructor = (await import("ioredis")).default; }
        catch { throw new SessionStorageError("Install ioredis to use Redis storage."); }
        const client = new Constructor(this.url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        client.on("error", () => undefined);
        try {
          await client.connect();
          return client;
        } catch (error) {
          client.disconnect();
          throw new SessionStorageError("Redis connection failed.", { cause: error });
        }
      })();
    }
    return this.connection;
  }

  private async read(id: string): Promise<ApiObject | null> {
    try {
      const value = await (await this.redis()).get(this.prefix + id);
      return value === null ? null : object(JSON.parse(value), "Session document");
    } catch (error) {
      throw new SessionStorageError("Redis session load failed.", { cause: error });
    }
  }

  /*
   * Atomically preserve omitted metadata while replacing session cookies.
   *
   * Lua keeps the read-modify-write operation inside Redis, avoiding a race
   * between independent workers. A configured TTL is renewed on each save;
   * an omitted TTL stores a persistent session document.
   */
  async save(id: string, cookies: Cookies, metadata?: ApiObject | null): Promise<void> {
    try {
      const validated = parseCookies(cookies);
      if (metadata != null) object(metadata, "Session metadata");
      await (await this.redis()).eval(`
        local metadata = {}
        if ARGV[2] == '' then
          local previous = redis.call('GET', KEYS[1])
          if previous then
            local document = cjson.decode(previous)
            metadata = document.metadata or {}
          end
        else
          metadata = cjson.decode(ARGV[2])
        end
        local value = cjson.encode({
          cookies = cjson.decode(ARGV[1]),
          metadata = metadata
        })
        if ARGV[3] == '' then
          redis.call('SET', KEYS[1], value)
        else
          redis.call('SET', KEYS[1], value, 'EX', ARGV[3])
        end
        return 1
      `, 1, this.prefix + id, JSON.stringify(validated),
      metadata == null ? "" : JSON.stringify(metadata),
      this.ttl === null ? "" : String(this.ttl));
    } catch (error) {
      throw new SessionStorageError("Redis session save failed.", { cause: error });
    }
  }

  async load(id: string): Promise<Cookies | null> {
    const data = await this.read(id);
    if (data === null) return null;
    try { return parseCookies(data.cookies); }
    catch (error) {
      throw new SessionStorageError("Invalid stored cookies.", { cause: error });
    }
  }

  async delete(id: string): Promise<void> {
    try { await (await this.redis()).del(this.prefix + id); }
    catch (error) {
      throw new SessionStorageError("Redis session delete failed.", { cause: error });
    }
  }

  async exists(id: string): Promise<boolean> {
    try { return await (await this.redis()).exists(this.prefix + id) !== 0; }
    catch (error) {
      throw new SessionStorageError("Redis existence check failed.", { cause: error });
    }
  }

  async loadMetadata(id: string): Promise<ApiObject | null> {
    const data = await this.read(id);
    return data === null ? null : object(data.metadata ?? {});
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.connection) {
      const client = await this.connection;
      try { await client.quit(); }
      finally { client.disconnect(); }
    }
  }

  async aclose(): Promise<void> {
    await this.close();
  }
}