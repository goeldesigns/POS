import { execSync } from "node:child_process";

/**
 * Bring the test database's schema up to date. `migrate deploy` only applies
 * pending migrations — it never drops data — so it's safe to run every time.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
