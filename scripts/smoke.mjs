import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await page.addInitScript(() => {
    window.addEventListener("sol-r:map-ready", (event) => {
      window.solRMap = event.detail;
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
  await page.goto(process.env.SOL_R_TEST_URL || "http://localhost:5173");
  await page.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
  async function checkSidebar() {
    const sidebar = page.getByRole("complementary", { name: "Explorer controls" });
    const data = sidebar.getByRole("region", { name: "Data layers", exact: true });
    const transit = sidebar.getByRole("region", { name: "Existing transit", exact: true });
    const names = async (scope) => scope.getByRole("checkbox").evaluateAll(
      (inputs) => inputs.map((input) => input.getAttribute("aria-label")),
    );
    assert.deepEqual(await names(sidebar), [
      "County boundaries", "Population", "Employment", "Equity", "Existing transit", "Bus baseline (LYNX)", "Sunshine Corridor (FDOT proposal)", "Proposed rail network", "Candidate connections", "Top commute flows",
    ]);
    assert.deepEqual(await names(sidebar.getByRole("region", {name:"Model candidates",exact:true})), ["Candidate connections"]);
    assert.deepEqual(await names(data), ["Population", "Employment", "Equity"]);
    assert.deepEqual(await names(transit), ["Existing transit", "Bus baseline (LYNX)"]);
    assert.deepEqual(await sidebar.locator(".layers h2").allTextContents(), ["Data layers", "Existing transit"]);
    assert.equal(await sidebar.locator(".layers > .layer-list strong").innerText(), "Boundaries");
    assert.equal(await data.locator(".section-note").innerText(), "Explore demand, jobs and need indicators by place.");
    assert.equal(await transit.locator(".section-note").innerText(), "Current rail and bus service.");
    assert.match(await data.locator(".section-heading").innerText(), /06 LIVE \/ 00 PLANNED/);
    assert.equal(await sidebar.locator(".data-note").count(), 0, "No stale Population status while off");
    for (const toggle of await sidebar.getByRole("checkbox").all()) {
      await toggle.scrollIntoViewIfNeeded();
      const box = await toggle.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= page.viewportSize().width);
    }
    await page.getByRole("button", { name: "Collapse sidebar" }).scrollIntoViewIfNeeded();
    console.log(`PASS sidebar grouping, order, counter, off-status and controls at ${page.viewportSize().width}px`);
  }
  async function checkCamera() {
    const result = await page.evaluate(async () => {
      const map = window.solRMap;
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
    await page.getByRole("button", { name: "Four counties" }).click();
  }
  await page
    .getByRole("button", { name: "Four counties", exact: true })
    .click();
  await checkCamera();
  await checkSidebar();
  assert.equal(await page.getByRole("checkbox").count(), 10);
  for (const name of ["Equity", "Bus baseline (LYNX)"])
    assert.equal(
      await page.getByRole("checkbox", { name, exact: true }).isDisabled(),
      false,
    );
  const countiesToggle = page.getByRole("checkbox", {
    name: "County boundaries",
  });
  assert.equal(await countiesToggle.isChecked(), true);
  await page.waitForFunction(() => window.solRMap.isSourceLoaded("counties"));
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
    return window.solRMap.project(orange.properties.label);
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await page
    .locator(".county-popup")
    .filter({ hasText: "Orange County" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.solRMap.getFeatureState({ source: "counties", id: "12095" })
          .hover,
    ),
    true,
  );
  await page.screenshot({ path: "/tmp/sol-r-counties-desktop.png" });
  await countiesToggle.uncheck();
  assert.equal(
    await page.evaluate(() =>
      window.solRMap.getLayoutProperty("county-outlines", "visibility"),
    ),
    "none",
  );
  assert.equal(
    await page.evaluate(() =>
      window.solRMap.getPaintProperty("county-outside", "fill-opacity"),
    ),
    0.99,
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
  await page.evaluate(() => window.solRMap.setZoom(12));
  assert.equal(
    await page
      .locator(".county-label")
      .first()
      .evaluate((el) => Number(el.style.opacity)),
    0,
  );
  await page.getByRole("button", { name: "Four counties" }).click();
  assert.ok(
    (await page
      .locator(".county-label")
      .first()
      .evaluate((el) => Number(el.style.opacity))) > 0,
  );
  assert.match(
    await page
      .locator(".county-attribution")
      .filter({ hasText: "Boundaries:" })
      .innerText(),
    /2026-10-12, 23:11 America\/New_York/,
  );
  assert.equal(await page.locator("canvas.maplibregl-canvas").count(), 1);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  assert.equal(await page.locator("#sidebar-content").isVisible(), false);
  await page.getByRole("button", { name: "Expand sidebar" }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#sidebar-content").isVisible(), true);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Four counties" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await checkSidebar();
  await page
    .getByRole("button", { name: "Four counties", exact: true })
    .click();
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
  await page.screenshot({ path: "/tmp/sol-r-counties-mobile.png" });
  // Also validate a fresh mobile load, including its default collapsed sidebar.
  await page.reload();
  await page.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
  assert.equal(await page.locator("#sidebar-content").isVisible(), false);
  await page
    .getByRole("button", { name: "Four counties", exact: true })
    .click();
  await checkCamera();
  // Check fresh default views and both camera presets across three aspect ratios.
  for (const [name, width, height] of [
    ["phone", 390, 844],
    ["laptop", 1440, 900],
    ["ultrawide", 2560, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await page
      .getByRole("status")
      .filter({ hasText: "BASEMAP LIVE" })
      .waitFor();
    const core = await page.evaluate(async () => {
      const { orlandoLandmarks } = await import("/src/config/mapViews.ts");
      const map = window.solRMap;
      const left = innerWidth > 600 ? 352 : 0;
      return {
        zoom: map.getZoom(),
        min: map.getMinZoom(),
        visible: Object.values(orlandoLandmarks).every((p) => {
          const point = map.project(p);
          return (
            point.x > left &&
            point.x < innerWidth &&
            point.y > 0 &&
            point.y < innerHeight - 80
          );
        }),
      };
    });
    assert.ok(core.visible, `${name}: all named Orlando anchors visible`);
    assert.ok(
      core.zoom > core.min + 1,
      `${name}: Orlando opens closer than overview`,
    );
    await page
      .getByRole("button", { name: "Four counties", exact: true })
      .click();
    await checkCamera();
    const limits = await page.evaluate(async () => {
      const { countyBounds, paddedCountyBounds } =
        await import("/src/map/studyArea.ts");
      const data = await (await fetch("/data/counties.geojson")).json();
      const bounds = countyBounds(data);
      const actual = window.solRMap.getMaxBounds().toArray();
      const expected = paddedCountyBounds(bounds);
      return {
        actual,
        expected,
        zoom: window.solRMap.getZoom(),
        min: window.solRMap.getMinZoom(),
      };
    });
    assert.deepEqual(
      limits.actual,
      limits.expected,
      "Tight data-derived maxBounds on every aspect ratio",
    );
    assert.ok(Math.abs(limits.zoom - limits.min) < 0.001);
    await page.getByRole("button", { name: "Orlando", exact: true }).click();
    assert.ok(
      Math.abs(
        (await page.evaluate(() => window.solRMap.getZoom())) - core.zoom,
      ) < 0.001,
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("orientationchange")),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    console.log(
      `PASS: ${name} ${width}x${height}, default zoom ${core.zoom.toFixed(2)}, minimum ${core.min.toFixed(2)}`,
    );
  }
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
    await page.getByRole("button", { name: "Four counties" }).isDisabled(),
    true,
  );
  console.log(
    "PASS: missing county geometry fails closed with explicit message.",
  );
  await page.screenshot({ path: "/tmp/sol-r-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/sol-r-desktop.png" });
} finally {
  await browser.close();
}
