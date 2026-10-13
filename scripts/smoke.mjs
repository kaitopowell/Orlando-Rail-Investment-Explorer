import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Test fixture only: deliberately no geographic or demographic observations.
  // This verifies WebGL integration and UI, not external basemap availability.
  await page.route("https://basemaps.cartocdn.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [
          {
            id: "test-background",
            type: "background",
            paint: { "background-color": "#10171c" },
          },
        ],
      }),
    }),
  );
  await page.goto(process.env.ORBIT_TEST_URL || "http://localhost:5173");
  await page.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 4);
  for (const control of await page.getByRole("checkbox").all())
    assert.equal(await control.isDisabled(), true);
  assert.equal(await page.locator("canvas.maplibregl-canvas").count(), 1);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  assert.equal(await page.locator("#sidebar-content").isVisible(), false);
  await page.getByRole("button", { name: "Expand sidebar" }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#sidebar-content").isVisible(), true);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page
    .getByRole("button", { name: "Recenter map on Greater Orlando" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: map initialization with empty style fixture, four disabled layers, collapse, keyboard expansion, navigation controls, mobile layout, no runtime exceptions.",
  );
  await page.unrouteAll();
  await page.route("https://basemaps.cartocdn.com/**", (route) =>
    route.abort(),
  );
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "Map resources could not load" })
    .waitFor();
  assert.match(
    await page.getByRole("status").innerText(),
    /BASEMAP UNAVAILABLE/,
  );
  console.log(
    "PASS: blocked basemap presents explicit error and unavailable status.",
  );
  await page.screenshot({ path: "/tmp/orbit-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/orbit-desktop.png" });
} finally {
  await browser.close();
}
