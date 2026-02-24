import crypto from "crypto";

const envSecret = process.env.EVENT_SECRET;

if (!envSecret) {
  throw new Error(
    "[CORE] EVENT_SECRET environment variable is not set. Refusing to start.",
  );
}

const SYSTEM_SECRET: string = envSecret;

export function signData(data: string): string {
  return crypto.createHmac("sha256", SYSTEM_SECRET).update(data).digest("hex");
}

export function verifySignature(data: string, signature: string): boolean {
  const expected = signData(data);
  return expected === signature;
}
