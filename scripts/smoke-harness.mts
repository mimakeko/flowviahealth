export class SmokeTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "SmokeTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export function requireSmokeEnv(scriptToken: string, names: string[]) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length === 0) return true;

  console.log(`SKIP_${scriptToken}_DB_ENV_MISSING missing=${missing.join(",")}`);
  return false;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new SmokeTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function smokeErrorSummary(error: unknown) {
  if (error instanceof SmokeTimeoutError) {
    return `operation="${error.label}" timeoutMs=${error.timeoutMs}`;
  }

  if (!(error instanceof Error)) return "unknown error";

  const errorWithCode = error as Error & {
    code?: string;
    meta?: {
      driverAdapterError?: { cause?: { kind?: string } };
      modelName?: string;
    };
  };
  const parts = [`message=${JSON.stringify(error.message)}`];
  if (errorWithCode.code) parts.push(`code=${errorWithCode.code}`);
  if (errorWithCode.meta?.modelName) parts.push(`model=${errorWithCode.meta.modelName}`);
  if (errorWithCode.meta?.driverAdapterError?.cause?.kind) {
    parts.push(`driver=${errorWithCode.meta.driverAdapterError.cause.kind}`);
  }
  return parts.join(" ");
}

export function smokeFailToken(scriptToken: string, error: unknown) {
  if (error instanceof SmokeTimeoutError) return `FAIL_${scriptToken}_DB_TIMEOUT`;
  return `FAIL_${scriptToken}_DB_ERROR`;
}
