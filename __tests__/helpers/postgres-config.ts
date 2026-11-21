const DEFAULT_TEST_DATABASE = "postgres://postgres:test@127.0.0.1:55432/mah_test";

export function assertTestDatabaseName(database: string): void {
  if (!/^mah_test(?:_[a-z0-9_]+)?$/.test(database)) {
    throw new Error("Use a disposable Postgres database named mah_test or mah_test_<suffix>");
  }
}

export function testDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE;
  const url = URL.parse(connectionString);
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must be a Postgres URL");
  }
  assertTestDatabaseName(decodeURIComponent(url.pathname.slice(1)));
  return connectionString;
}
