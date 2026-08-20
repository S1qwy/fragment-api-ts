import * as fs from "fs/promises";
import * as path from "path";
import { SessionStorage } from "./base";

/**
 * Store session cookies as JSON files on the local filesystem.
 */
export class FileSessionStorage extends SessionStorage {
  private _directory: string;
  private _extension: string;

  constructor(directory: string = ".fragment_sessions", fileExtension: string = ".json") {
    super();
    this._directory = directory;
    this._extension = fileExtension;
  }

  private _sessionPath(sessionId: string): string {
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this._directory, `${safeId}${this._extension}`);
  }

  private async _ensureDir(): Promise<void> {
    await fs.mkdir(this._directory, { recursive: true });
  }

  async save(sessionId: string, cookies: Record<string, string>, metadata?: Record<string, any> | null): Promise<void> {
    await this._ensureDir();
    const data = { cookies, metadata: metadata || {} };
    const filePath = this._sessionPath(sessionId);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async load(sessionId: string): Promise<Record<string, string> | null> {
    const filePath = this._sessionPath(sessionId);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      return data.cookies || null;
    } catch {
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const filePath = this._sessionPath(sessionId);
    try {
      await fs.unlink(filePath);
    } catch {}
  }

  async loadMetadata(sessionId: string): Promise<Record<string, any> | null> {
    const filePath = this._sessionPath(sessionId);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      return data.metadata || null;
    } catch {
      return null;
    }
  }
}