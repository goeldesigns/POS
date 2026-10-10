/**
 * Development-only PostgreSQL server.
 *
 * Runs a real PostgreSQL binary (via the `embedded-postgres` package) so the
 * project works on machines without a system Postgres or Docker. Data lives in
 * `.local/postgres`. Production deployments should use a managed Postgres and
 * point DATABASE_URL at it instead.
 *
 *   npm run db:local          # start (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const DATA_DIR = path.resolve(".local/postgres");
const DATABASES = ["tabla_dev", "tabla_test"];

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    // Windows defaults to WIN1252; the app stores ₹ and other UTF-8 text.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (message) => console.error("[postgres]", message),
  });

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("Initialising new local cluster in .local/postgres …");
    await pg.initialise();
  }

  await pg.start();

  for (const name of DATABASES) {
    try {
      await pg.createDatabase(name);
      console.log(`Created database ${name}`);
    } catch {
      // already exists
    }
  }

  console.log(`\nPostgreSQL running on postgresql://postgres:postgres@localhost:${PORT}`);
  console.log(`Databases: ${DATABASES.join(", ")}`);
  console.log("Press Ctrl+C to stop.\n");

  const shutdown = async () => {
    console.log("\nStopping PostgreSQL …");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive.
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
