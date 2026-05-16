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
