import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PILOT_SESSION_COOKIE = "flowvia_pilot_session";
export const PILOT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export type PilotRole = "admin" | "therapist";

export type PilotSession = {
  email: string;
  exp: number;
  iat: number;
  role: PilotRole;
  version: "pilot_v1";
};

const passwordHashPrefix = "scrypt";
const sessionPrefix = "v1";
const scryptCost = 16384;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const passwordHashBytes = 64;

function base64UrlEncode(input: Buffer | string) {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function signSessionPayload(prefixAndPayload: string, secret: string) {
  return createHmac("sha256", secret).update(prefixAndPayload).digest("base64url");
}

export function normalizePilotEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parsePilotEmailList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((email) => normalizePilotEmail(email))
    .filter(Boolean);
}

export function createScryptPasswordHash(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, passwordHashBytes, {
    N: scryptCost,
    p: scryptParallelization,
    r: scryptBlockSize,
  });

  return [passwordHashPrefix, scryptCost, scryptBlockSize, scryptParallelization, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyScryptPasswordHash(password: string, storedHash: string | undefined) {
  const normalizedHash = storedHash?.trim();
  if (!normalizedHash) return false;

  const [prefix, cost, blockSize, parallelization, saltValue, expectedValue] = normalizedHash.split("$");
  if (prefix !== passwordHashPrefix || !cost || !blockSize || !parallelization || !saltValue || !expectedValue) return false;

  try {
    const expected = Buffer.from(expectedValue, "base64url");
    const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length, {
      N: Number(cost),
      p: Number(parallelization),
      r: Number(blockSize),
    });

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createPilotSessionCookieValue(input: { email: string; role: PilotRole }, secret: string, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const session: PilotSession = {
    email: normalizePilotEmail(input.email),
    exp: iat + PILOT_SESSION_TTL_SECONDS,
    iat,
    role: input.role,
    version: "pilot_v1",
  };
  const payload = base64UrlEncode(JSON.stringify(session));
  const signedPayload = `${sessionPrefix}.${payload}`;
  const signature = signSessionPayload(signedPayload, secret);

  return `${signedPayload}.${signature}`;
}

export function verifyPilotSessionCookieValue(cookieValue: string | undefined, secret: string | undefined, now = Date.now()): PilotSession | null {
  if (!cookieValue || !secret) return null;

  const [prefix, payload, signature] = cookieValue.split(".");
  if (prefix !== sessionPrefix || !payload || !signature) return null;

  const signedPayload = `${prefix}.${payload}`;
  const expectedSignature = signSessionPayload(signedPayload, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload).toString("utf8")) as Partial<PilotSession>;
    const nowSeconds = Math.floor(now / 1000);

    if (session.version !== "pilot_v1") return null;
    if (session.role !== "admin" && session.role !== "therapist") return null;
    if (!session.email || normalizePilotEmail(session.email) !== session.email) return null;
    if (typeof session.iat !== "number" || typeof session.exp !== "number" || session.exp <= nowSeconds) return null;

    return session as PilotSession;
  } catch {
    return null;
  }
}
