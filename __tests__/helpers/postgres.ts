/**
 * Test database helper.
 *
 * These tests run against a **real Postgres**, not an emulator. The
 * properties they assert — no overselling under concurrent buyers, one
 * admission under concurrent scans — are properties of row locks and
 * `where ... is null` predicates. An in-memory SQL fake would happily run the
 * statements and prove nothing about either.
 *
 * Start one with:
 *
 *   docker run -d --name mah-test-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=mah_test -p 55432:5432 postgres:18-alpine
 *
 * Suites call `describeWithDatabase`, which skips cleanly when no database is
 * reachable so the rest of the suite still runs. `vitest.globalSetup.ts`
 * probes once and records the answer.
 */

import { describe } from "vitest";
import { assertTestDatabaseName, testDatabaseUrl } from "./postgres-config";

export const databaseReady = process.env.MAH_TEST_DB_READY === "1";

/** `describe`, or `describe.skip` when there is no test database. */
export const describeWithDatabase = databaseReady ? describe : describe.skip;

/**
 * Serialises whole test files against the shared database.
 *
 * Vitest runs files in parallel workers; two suites resetting and truncating
 * the same tables would corrupt each other mid-test. Each file takes this
 * session-level advisory lock in `applySchema` and holds it until
 * `closeDatabase`, so database suites run one file at a time while everything
 * else stays parallel.
 */
const TEST_SUITE_LOCK_KEY = 8_147_299;
let suiteLockClient: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  release: () => void;
} | null = null;

export async function applySchema(): Promise<void> {
  process.env.DATABASE_URL = testDatabaseUrl();
  const { getPool, query } = await import("@/lib/platform/postgres.server");
  const { runMigrations } = await import("@/lib/platform/migrations.server");

  const pool = getPool();
  if (pool && !suiteLockClient) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ database: string }>(
        "select current_database() as database",
      );
      assertTestDatabaseName(rows[0].database);
      await client.query("select pg_advisory_lock($1)", [TEST_SUITE_LOCK_KEY]);
      suiteLockClient = client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  }

  await query(`
    drop schema if exists legacy_archive cascade;
    drop schema public cascade;
    create schema public;
  `);
  await runMigrations();
}

/** Fast per-test cleanup that keeps the schema in place. */
export async function truncateAll(): Promise<void> {
  const { query } = await import("@/lib/platform/postgres.server");
  await query(
    `truncate application_scheduled_jobs, email_delivery_events, email_suppressions, email_outbox, communication_links, survey_responses, survey_invitations, surveys, poll_votes, polls, pitch_decks,
              attendee_credit_claim_links, attendee_credit_grants, attendee_credit_campaigns,
              event_waitlist_inventory, event_waitlist_entries, checkout_sessions, tickets,
              ticket_types, events restart identity cascade`,
  );
  // New tables land via cascade from events/tickets, but be explicit so a
  // future FK loosening cannot quietly leak state between tests.
  await query(
    `truncate hot_and_cold_daily_results, person_recovery_codes, person_totp_authenticators, person_passkeys,
              person_webauthn_profiles, event_order_managers, event_ticket_identity_claims,
              event_person_login_challenges, event_person_identifiers, event_people,
              attendee_operations_audit_events, admin_alert_recipients, admin_notification_reads,
              admin_notifications,
              admin_attention_cases, attendee_domain_events, global_admin_grants,
              ticket_refund_allocations, ticket_return_requests, ticket_transfers,
              ticket_assignments, attendee_action_links, event_operation_policies,
              event_drops, guest_requests, scanner_link_devices, scanner_links,
              checkpoint_usage, checkpoints, site_settings cascade`,
  ).catch(() => {});
  await query(
    `update attendee_operation_settings set
       global_availability = '{"scoring":true,"publicLeaderboard":true,"manualStaffAwards":true,"discoveries":true,"guestPhotos":true,"transfers":false,"onwardTransfers":false,"complimentaryTransfers":false}'::jsonb,
       new_event_defaults = '{"scoring":false,"publicLeaderboard":false,"manualStaffAwards":false,"discoveries":false,"guestPhotos":false,"transfers":false,"onwardTransfers":false,"complimentaryTransfers":false}'::jsonb,
       emergency_paused = '{}'::jsonb, revision = 1, updated_by = 'root-owner',
       update_reason = null, updated_at = now()
     where id = true`,
  ).catch(() => {});
  await query(
    `update pitch_platform_settings set mode = 'enabled', updated_at = now() where singleton = true`,
  ).catch(() => {});
}

export async function closeDatabase(): Promise<void> {
  if (suiteLockClient) {
    await suiteLockClient
      .query("select pg_advisory_unlock($1)", [TEST_SUITE_LOCK_KEY])
      .catch(() => {});
    suiteLockClient.release();
    suiteLockClient = null;
  }
  const { closePool } = await import("@/lib/platform/postgres.server");
  await closePool();
}
