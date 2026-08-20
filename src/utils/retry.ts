import { FragmentPageError } from "../exceptions";

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1000;
const RETRY_MAX_DELAY = 30000;
const RETRY_MULTIPLIER = 2.0;
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetryException(exc: Error): boolean {
  if (exc instanceof FragmentPageError) {
    const msg = exc.message;
    for (const code of RETRY_STATUS_CODES) {
      if (msg.includes(`HTTP ${code}`)) return true;
    }
  }
  const excStr = exc.message.toLowerCase();
  const indicators = ["timeout", "connection", "reset", "broken pipe", "429", "too many requests"];
  return indicators.some((ind) => excStr.includes(ind));
}

/**
 * Decorator-style wrapper that retries an async function with exponential backoff.
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    multiplier?: number;
    context?: string;
  }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? RETRY_MAX_ATTEMPTS;
  const baseDelay = options?.baseDelay ?? RETRY_BASE_DELAY;
  const maxDelay = options?.maxDelay ?? RETRY_MAX_DELAY;
  const multiplier = options?.multiplier ?? RETRY_MULTIPLIER;

  return (async () => {
    let delay = baseDelay;
    let lastExc: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (exc: any) {
        lastExc = exc;

        if (!shouldRetryException(exc) || attempt === maxAttempts) {
          throw exc;
        }

        const jitter = Math.random() * delay * 0.3;
        const sleepTime = Math.min(delay + jitter, maxDelay);

        await sleep(sleepTime);
        delay *= multiplier;
      }
    }

    throw lastExc;
  })();
}