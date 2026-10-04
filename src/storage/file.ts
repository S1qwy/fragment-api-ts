import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SessionStorageError } from "../exceptions";
import type { ApiObject, Cookies } from "../types/results";
import { Mutex } from "../utils/async";
import { object, parseCookies } from "../utils/validation";
import { SessionStorage } from "./base";

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "ENOENT";
}

export class FileSessionStorage extends SessionStorage {
  private readonly lock = new Mutex();

  constructor(
    private readonly directory = ".fragment_sessions",
    private readonly extension = ".json"
  ) {
    super();
    if (!/^\.[A-Za-z0-9._-]+$/.test(extension)) {
      throw new SessionStorageError("Invalid session file extension.");
    }
  }

  private filename(id: string): string {
    return path.join(
      this.directory,
      createHash("sha256").update(id).digest("hex") + this.extension
    );
  }

  private async read(id: string): Promise<ApiObject | null> {
    let content: string;
    try { content = await fs.readFile(this.filename(id), "utf8"); }
    catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    return object(JSON.parse(content), "Session document");
  }

  /*
   * Persist a validated session through same-directory atomic replacement.
   *
   * Temporary files use exclusive creation and restrictive Unix permissions.
   * Metadata is retained when omitted. The local lock prevents races inside
   * this storage instance but is not a cross-process transaction mechanism.
   */
  async save(id: string, cookies: Cookies, metadata?: ApiObject | null): Promise<void> {
    try {
      const validated = parseCookies(cookies);
      await this.lock.run(async () => {
        const previous = await this.read(id);
        const retained = metadata ?? previous?.metadata ?? {};
        object(retained, "Session metadata");
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const temporary = path.join(this.directory, `.session-${randomUUID()}`);
        try {
          const handle = await fs.open(temporary, "wx", 0o600);
          try {
            await handle.writeFile(JSON.stringify({
              cookies: validated, metadata: retained,
            }, null, 2), "utf8");
            await handle.sync();
          } finally {
            await handle.close();
          }
          await fs.rename(temporary, this.filename(id));
        } finally {
          await fs.unlink(temporary).catch(error => {
            if (!missing(error)) throw error;
          });
        }
      });
    } catch (error) {
      throw new SessionStorageError("Session save failed.", { cause: error });
    }
  }

  async load(id: string): Promise<Cookies | null> {
    try {
      const data = await this.read(id);
      return data === null ? null : parseCookies(data.cookies);
    } catch (error) {
      throw new SessionStorageError("Session load failed.", { cause: error });
    }
  }

  async delete(id: string): Promise<void> {
    try { await fs.unlink(this.filename(id)); }
    catch (error) {
      if (!missing(error)) {
        throw new SessionStorageError("Session delete failed.", { cause: error });
      }
    }
  }

  async loadMetadata(id: string): Promise<ApiObject | null> {
    try {
      const data = await this.read(id);
      return data === null ? null : object(data.metadata ?? {});
    } catch (error) {
      throw new SessionStorageError("Session metadata load failed.", { cause: error });
    }
  }
}