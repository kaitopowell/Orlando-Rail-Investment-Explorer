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
  assert.equal(await page.getByRole("checkbox").count(), 5);
  for (const name of [
    "Population",
    "Employment",
    "Household income",
    "Existing transit",
  ])
    assert.equal(
      await page.getByRole("checkbox", { name, exact: true }).isDisabled(),
      true,
    );
  const countiesToggle = page.getByRole("checkbox", {
    name: "County boundaries",
  });
  assert.equal(await countiesToggle.isChecked(), true);
  await page.waitForFunction(() => window.orbitMap.isSourceLoaded("counties"));
  assert.equal(await page.locator(".county-label").count(), 4);
  const labelOpacity = await page
    .locator(".county-label")
    .first()
    .evaluate((el) => Number(el.style.opacity));
  assert.ok(labelOpacity > 0);
  // Move over an actual derived interior point, not an invented map observation.
  const hoverPoint = await page.evaluate(async () => {
    const data = await (await fetch("/data/counties.geojson")).json();
    const orange = data.features.find((f) => f.properties.GEOID === "12095");
    return window.orbitMap.project(orange.properties.label);
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await page
    .locator(".county-popup")
    .filter({ hasText: "Orange County" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.orbitMap.getFeatureState({ source: "counties", id: "12095" })
          .hover,
    ),
    true,
  );
  await page.screenshot({ path: "/tmp/orbit-counties-desktop.png" });
  await countiesToggle.uncheck();
  assert.equal(
    await page.evaluate(() =>
      window.orbitMap.getLayoutProperty("county-outlines", "visibility"),
    ),
    "none",
  );
  assert.equal(
    await page.evaluate(() =>
      window.orbitMap.getLayoutProperty("county-outside", "visibility"),
    ),
    "none",
  );
  assert.equal(await page.locator(".county-popup").count(), 0);
  assert.equal(
    await page
      .locator(".county-label")
      .first()
      .evaluate((el) => Number(el.style.opacity)),
    0,
  );
  await countiesToggle.check();
  await page.evaluate(() => window.orbitMap.setZoom(12));
  assert.equal(
    await page
      .locator(".county-label")
      .first()
      .evaluate((el) => Number(el.style.opacity)),
    0,
  );
  await page
    .getByRole("button", { name: "Recenter map on Greater Orlando" })
    .click();
  assert.ok(
    (await page
      .locator(".county-label")
      .first()
      .evaluate((el) => Number(el.style.opacity))) > 0,
  );
  assert.match(
    await page.locator(".county-attribution").innerText(),
    /2026-10-12, 23:11 America\/New_York/,
  );
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
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.screenshot({ path: "/tmp/orbit-counties-mobile.png" });
  // Also validate a fresh mobile load, including its default collapsed sidebar.
  await page.reload();
  await page.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
  assert.equal(await page.locator("#sidebar-content").isVisible(), false);
  await checkCamera();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real county geometry, desktop/mobile camera constraints, default-on toggle, hover, label fade, dimming visibility, attribution, collapse/keyboard controls, no runtime exceptions.",
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
  await page.route("**/data/counties.geojson", (route) => route.abort());
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "County boundaries could not load" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Recenter map on Greater Orlando" })
      .isDisabled(),
    true,
  );
  console.log(
    "PASS: missing county geometry fails closed with explicit message.",
  );
  await page.screenshot({ path: "/tmp/orbit-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/orbit-desktop.png" });
} finally {
  await browser.close();
}
