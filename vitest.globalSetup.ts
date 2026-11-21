import { Client } from "pg";
import { assertTestDatabaseName, testDatabaseUrl } from "./__tests__/helpers/postgres-config";

/**
 * Probe for a test Postgres once, before any suite runs.
 *
 * Database-backed suites skip rather than fail when none is reachable, so a
 * clone without Docker still gets a green run for everything else. CI is
 * expected to provide one.
 */
export default async function globalSetup() {
  const connectionString = testDatabaseUrl();

  const client = new Client({ connectionString, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    const { rows } = await client.query<{ database: string }>(
      "select current_database() as database",
    );
    assertTestDatabaseName(rows[0].database);
    process.env.MAH_TEST_DB_READY = "1";
    process.env.TEST_DATABASE_URL = connectionString;
  } catch (cause) {
    process.env.MAH_TEST_DB_READY = "0";
    if (process.env.CI) {
      throw new Error(
        "CI requires a reachable TEST_DATABASE_URL; database verification cannot be skipped.",
        { cause },
      );
    }
    console.warn(
      "\n[tests] No Postgres at",
      connectionString.replace(/:[^:@]*@/, ":***@"),
      "— database-backed suites will be skipped.\n",
    );
  } finally {
    await client.end().catch(() => {});
  }
}
