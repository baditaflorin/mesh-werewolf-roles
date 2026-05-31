import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("two-player flow renders join + commit phase without crashing", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    await a.getByRole("button", { name: /join — commit a salt/ }).click();
    await b.getByRole("button", { name: /join — commit a salt/ }).click();

    await expect(a.locator(".viral-tags")).toContainText("alice");
    await expect(a.locator(".viral-tags")).toContainText("bob");
    await expect(a.locator(".viral-status").first()).toContainText("2 players");
  } finally {
    await cleanup();
  }
});

/**
 * The advertised core action: a commit-reveal SECRET ROLE DEAL that crosses
 * the mesh — each peer privately sees only its own role, the werewolf differs,
 * and the deal is dealt identically on every peer from the shared revealed
 * salts (no central dealer, no leak).
 *
 * Needs 3+ players (start is gated on `playerList.length >= 3` and the role
 * pool for 3 is [Werewolf, Werewolf, Seer]). openTwoPeers exposes the shared
 * `context`, which carries the same room/signaling init script, so a third
 * page joins the same room over the BroadcastChannel transport.
 *
 * Load-bearing assertions read each peer's OWN displayed role and reconcile
 * them: the three self-roles must form exactly the multiset {Werewolf,
 * Werewolf, Seer}. That is only possible if every peer ran the SAME
 * deterministic Fisher-Yates over the SAME combined salts — i.e. the deal
 * genuinely converged across the mesh. A regression where a peer dealt from
 * its own local salt, or read a per-peer Y.Map key the others didn't write,
 * would yield a mismatched multiset and fail.
 */
test("secret role deal crosses the mesh: each peer privately sees its own role and the deal reconciles", async ({
  browser,
  baseURL,
}) => {
  const { context, a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // A third peer joins the same room (shares the context init script).
    const c = await context.newPage();
    await c.goto(baseURL ?? "");

    const peers: Array<[import("@playwright/test").Page, string]> = [
      [a, "alice"],
      [b, "bob"],
      [c, "carol"],
    ];

    // Everyone names themselves and joins (commits a salt).
    for (const [page, who] of peers) {
      await page.getByPlaceholder("your name").fill(who);
      await page.getByRole("button", { name: /join — commit a salt/ }).click();
    }

    // All three players propagate to every peer.
    for (const [page] of peers) {
      await expect(page.locator(".viral-status").first()).toContainText("3 players");
    }

    // A starts the game; the phase change must cross the mesh to B and C.
    await a.getByRole("button", { name: /start game/ }).click();
    for (const [page] of peers) {
      await expect(page.getByRole("button", { name: /reveal my salt/ })).toBeVisible();
    }

    // Each peer reveals its own salt (the commit-reveal step).
    for (const [page] of peers) {
      await page.getByRole("button", { name: /reveal my salt/ }).click();
    }

    // Once all salts are in, every peer derives and displays ITS OWN role.
    const roles: string[] = [];
    for (const [page] of peers) {
      const roleEl = page.locator(".wf-role");
      await expect(roleEl).toBeVisible();
      // No leak: a peer's own role panel shows exactly one role.
      await expect(roleEl).toHaveCount(1);
      const text = (await roleEl.innerText()).trim();
      const m = text.match(/your role:\s*(\w+)/i);
      expect(m, `role text was "${text}"`).not.toBeNull();
      roles.push(m![1]!);
    }

    // The three self-reported roles must reconcile to the exact deal multiset.
    // This only holds if every peer dealt identically from the shared salts.
    expect(roles.slice().sort()).toEqual(["Seer", "Werewolf", "Werewolf"]);

    // The werewolf is not universal: at least one peer is NOT a werewolf.
    expect(roles.filter((r) => r !== "Werewolf").length).toBe(1);
  } finally {
    await cleanup();
  }
});
