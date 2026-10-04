import type { ApiObject, Cookies } from "../types/results";

export abstract class SessionStorage {
  abstract save(
    sessionId: string,
    cookies: Cookies,
    metadata?: ApiObject | null
  ): Promise<void>;

  abstract load(sessionId: string): Promise<Cookies | null>;
  abstract delete(sessionId: string): Promise<void>;

  async exists(sessionId: string): Promise<boolean> {
    return await this.load(sessionId) !== null;
  }

  async loadMetadata(_sessionId: string): Promise<ApiObject | null> {
    return null;
  }
}