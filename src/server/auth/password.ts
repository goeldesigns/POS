import bcrypt from "bcryptjs";

const COST = process.env.NODE_ENV === "test" ? 4 : 11;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | null = null;

/**
 * Run a comparable bcrypt check when the account doesn't exist so response
 * timing doesn't reveal which emails are registered.
 */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash("tabla-timing-guard", COST);
  await bcrypt.compare(plain, await dummyHash);
}
