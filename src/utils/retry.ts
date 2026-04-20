import axios from 'axios';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Executes an async function with exponential backoff retry logic.
 *
 * Delay formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 * Jitter prevents thundering herd when multiple retries fire simultaneously.
 *
 * Only retries on transient errors (network, 5xx, 429). Client errors (4xx)
 * are thrown immediately since retrying won't fix them.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        throw lastError;
      }

      if (attempt === config.maxRetries) {
        break;
      }

      const delay = calculateBackoff(attempt, config);
      console.warn(
        `[Retry] Attempt ${attempt + 1}/${config.maxRetries} failed: ${lastError.message}. ` +
        `Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  throw new Error(
    `Operation failed after ${config.maxRetries} retries. Last error: ${lastError?.message}`
  );
}

function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    // Retry on: no response (network error), 429 (rate limit), 5xx (server error)
    if (!status) return true;
    if (status === 429) return true;
    if (status >= 500) return true;
    // Don't retry 4xx client errors (except 429)
    return false;
  }
  // Retry on generic network/timeout errors
  return true;
}

function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * config.baseDelayMs;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
