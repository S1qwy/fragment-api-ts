import { setTimeout as delay } from "node:timers/promises";
import { ConfigurationError, RetryExhaustedError } from "../exceptions";

export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  /*
   * Serialize operations in arrival order and always release the next waiter.
   *
   * The queue survives a rejected operation. This lock coordinates one object
   * in one process only; it is not a distributed wallet or session lock.
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await delay(ms, undefined, { signal });
}

/*
 * Retry only failures explicitly classified as safe by the caller.
 *
 * This utility is not used around payment broadcasts or state-changing
 * Fragment requests. The caller owns the idempotency decision and must not
 * classify an uncertain payment as permission to create a replacement.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    multiplier?: number;
    context?: string;
    retryIf?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const attempts = options.maxAttempts ?? 3;
  let wait = options.baseDelay ?? 1000;
  const maximum = options.maxDelay ?? 30_000;
  const multiplier = options.multiplier ?? 2;
  if (
    !Number.isSafeInteger(attempts) || attempts < 1 ||
    !Number.isFinite(wait) || wait < 0 ||
    !Number.isFinite(maximum) || maximum < 0 ||
    !Number.isFinite(multiplier) || multiplier < 1
  ) throw new ConfigurationError("Invalid retry configuration.");
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!options.retryIf?.(error)) throw error;
      if (attempt + 1 >= attempts) {
        throw new RetryExhaustedError(
          `${options.context ?? "Operation"} exhausted ${attempts} attempts.`,
          { cause: error }
        );
      }
      await sleep(Math.min(maximum, wait * (1 + Math.random() * 0.3)));
      wait = Math.min(maximum, wait * multiplier);
    }
  }
}