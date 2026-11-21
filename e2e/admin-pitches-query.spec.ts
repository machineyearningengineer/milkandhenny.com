import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { waitForAppHydration } from "./support/multiplayer";

test("selected pitch detail opens through a private Query", async ({ page }) => {
  test.setTimeout(60_000);
  const database = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  const suffix = randomUUID().slice(0, 8);
  const title = `Admin Query Pitch ${suffix}`;
  let deckId = "";
  try {
    await page.goto("/things/pitches/new");
    await page.getByLabel("pitch title").fill(title);
    await page.getByLabel("your name").fill("Query Pitch Owner");
    await page.getByLabel("recovery email").fill(`pitch-${suffix}@example.com`);
    await page.getByRole("button", { name: "open the studio" }).click();
    await expect(page).toHaveURL(/\/things\/pitches\/[^/]+\/edit/);
    deckId = new URL(page.url()).pathname.split("/")[3] ?? "";

    const url = "/admin?view=events&eventWorkspace=pitches";
    await page.goto(url);
    await waitForAppHydration(page);
    const password = page.getByLabel("admin password", { exact: true });
    if (await password.isVisible()) {
      await password.fill("playwright-admin-password");
      await page.getByRole("button", { name: "unlock", exact: true }).click();
      await waitForAppHydration(page);
      await page.goto(url);
      await waitForAppHydration(page);
    }
    await expect(page.locator("#pitch-manager")).not.toHaveAttribute("inert");
    await page.getByRole("button", { name: `Edit ${title}` }).click();
    await expect(page.getByRole("heading", { name: "Pitch control room" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "pitch title", exact: true })).toHaveValue(
      title,
    );
  } finally {
    if (deckId) await database.query("delete from pitch_decks where id=$1", [deckId]);
    await database.end();
  }
});
