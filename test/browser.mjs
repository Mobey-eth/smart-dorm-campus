import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.env.TEST_URL || "http://127.0.0.1:3015";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("test-results", { recursive: true });
try {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: /^Hi, Emeka/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Inter");
  expect(
    await page
      .locator(".fa-microchip")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Font Awesome");
  await expect(page.locator("#wallet-balance")).toHaveText("₦4,500");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Top Up", exact: true }).click();
  await expect(page.locator("#wallet-balance")).toHaveText("₦5,500");
  await page.reload();
  await expect(page.locator("#wallet-balance")).toHaveText("₦5,500");
  await page.getByRole("button", { name: "Reset presentation" }).click();
  await page.locator("#reset-pin").fill("wrong");
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect(page.locator(".form-error")).toHaveText(
    "Incorrect confirmation PIN.",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Unlock basket", exact: true })
    .click();
  await page.locator("#pin").fill("0000");
  await page
    .getByRole("button", { name: "Unlock basket", exact: true })
    .last()
    .click();
  await expect(page.locator(".form-error")).toHaveText("Incorrect PIN.");
  await page.locator("#pin").fill("4829");
  await page
    .getByRole("button", { name: "Unlock basket", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your basket B-04" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add 250 g" }).click();
  await expect(page.locator(".modal .metric")).toContainText("2.70");
  await page.getByRole("button", { name: "Lock basket", exact: true }).click();
  await page
    .locator("#sidebar")
    .getByRole("button", { name: "Laundry", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Book Wash Cycle", exact: true })
    .first()
    .click();
  const d = new Date(Date.now() + 3600000);
  await page
    .locator("#start")
    .fill(
      new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    );
  await page.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(
    page.getByRole("heading", { name: "My Bookings" }),
  ).toBeVisible();
  await expect(
    page.locator("#main").getByText("Reserved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trigger Cycle Alert" }).click();
  await expect(
    page.locator("#main").getByText("Awaiting collection", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I’ve collected my clothes" }).click();
  await page
    .getByRole("button", { name: "Switch to administrator view" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Administration" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bring online" }).click();
  await page.getByRole("button", { name: "Weight Change" }).click();
  await expect(
    page.getByRole("button", { name: "Mark reviewed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByRole("button", { name: "Switch to resident view" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  for (const tab of ["Home", "Fridge", "Microwave", "Laundry"]) {
    await page
      .locator("nav")
      .getByRole("button", { name: tab, exact: true })
      .click();
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.width);
  }
  await page
    .locator("nav")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset presentation" }).click();
  await page
    .locator("#reset-pin")
    .fill(process.env.TEST_RESET_PIN || "test-reset-pin");
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect(page.getByRole("heading", { name: /^Hi, Emeka/ })).toBeVisible();
  await expect(page.locator(".modal")).toHaveCount(0);
  await page.getByRole("button", { name: "Your account" }).click();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.locator("#username").fill(`browser_${Date.now()}`);
  await page.locator("#password").fill("browser-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^Hi, browser_/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /^Hi, browser_/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Browser checks passed: desktop/mobile, PIN access, weight, reservations, completion/collection, admin, alerts, reset, account persistence; no console errors or horizontal overflow.",
  );
} finally {
  await browser.close();
}
