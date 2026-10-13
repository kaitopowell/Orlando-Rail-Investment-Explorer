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
  await page.addInitScript(() => {
    window.addEventListener("orbit:map-ready", (event) => {
      window.orbitMap = event.detail;
    });
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
  async function checkCamera() {
    const result = await page.evaluate(async () => {
      const map = window.orbitMap;
      const data = await (await fetch("/data/counties.geojson")).json();
      const points = data.features.flatMap((f) =>
        f.geometry.type === "Polygon"
          ? f.geometry.coordinates.flat()
          : f.geometry.coordinates.flat(2),
      );
      const projected = points.map((p) => map.project(p));
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const visible = projected.every(
        (p) => p.x >= -1 && p.x <= w + 1 && p.y >= -1 && p.y <= h + 1,
      );
      const min = map.getMinZoom();
      map.setZoom(0);
      const zoomClamped = map.getZoom() >= min - 0.001;
      map.setCenter([0, 0]);
      const panClamped = map.getMaxBounds().contains(map.getCenter());
      return { visible, zoomClamped, panClamped, min };
    });
    assert.equal(result.visible, true, "All county geometry fits the viewport");
    assert.equal(
      result.zoomClamped,
      true,
      "Cannot zoom out below regional minimum",
    );
    assert.equal(
      result.panClamped,
      true,
      "Cannot pan outside padded study bounds",
    );
    assert.ok(
      result.min > 5 && result.min < 12,
      "Regional, viewport-derived minimum zoom",
    );
    await page
      .getByRole("button", { name: "Recenter map on Greater Orlando" })
      .click();
  }
  await checkCamera();
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
  await page.waitForTimeout(250);
  await checkCamera();
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
  assert.match(await page.getByRole("status").innerText(), /MAP UNAVAILABLE/);
  console.log(
    "PASS: blocked basemap presents explicit error and unavailable status.",
  );
  await page.screenshot({ path: "/tmp/orbit-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/orbit-desktop.png" });
} finally {
  await browser.close();
}
