/**
 * Abstract interface for persisting Fragment session cookies.
 */
export abstract class SessionStorage {
  abstract save(sessionId: string, cookies: Record<string, string>, metadata?: Record<string, any> | null): Promise<void>;
  abstract load(sessionId: string): Promise<Record<string, string> | null>;
  abstract delete(sessionId: string): Promise<void>;

  async exists(sessionId: string): Promise<boolean> {
    return (await this.load(sessionId)) !== null;
  }

  async loadMetadata(_sessionId: string): Promise<Record<string, any> | null> {
    return null;
  }
}