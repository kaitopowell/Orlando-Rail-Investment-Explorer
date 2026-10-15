import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  for (const [name, width, height] of [
    ["phone", 390, 844],
    ["laptop", 1440, 900],
  ]) {
    const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /deck|WebGL/.test(m.text()))
        errors.push(m.text());
    });
    await page.addInitScript(() => {
      window.addEventListener(
        "sol-r:map-ready",
        (e) => (window.map = e.detail),
      );
      window.addEventListener(
        "sol-r:deck-ready",
        (e) => (window.deck = e.detail),
      );
    });
    await page.route("https://basemaps.cartocdn.com/**", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#10171c" },
            },
          ],
        }),
      }),
    );
    await page.goto("http://localhost:5173");
    await page
      .getByRole("status")
      .filter({ hasText: "BASEMAP LIVE" })
      .waitFor();
    const expand = async () => {
      if (
        await page.getByRole("button", { name: "Expand sidebar" }).isVisible()
      )
        await page.getByRole("button", { name: "Expand sidebar" }).click();
    };
    await expand();
    await page
      .getByRole("checkbox", {
        name: "Population",
        exact: true,
        includeHidden: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Inspect hexagon", exact: true })
      .waitFor();
    await expand();
    await page
      .getByRole("checkbox", { name: "Employment", exact: true })
      .check();
    await page
      .getByLabel("Inspect employment tract", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".hexagon-panel").count(), 0);
    assert.equal(
      await page
        .getByRole("checkbox", {
          name: "Population",
          exact: true,
          includeHidden: true,
        })
        .isChecked(),
      false,
    );
    await page.waitForFunction(() => window.map.getPitch() === 45);
    assert.equal(
      await page
        .getByLabel("Inspect employment tract", { exact: true })
        .locator("option")
        .count(),
      491,
    );
    const count = await page.evaluate(
      () =>
        window.deck._deck.props.layers
          .flat(Infinity)
          .find((l) => l.id === "employment-columns").props.data.length,
    );
    assert.equal(count, 489);
    await page
      .getByLabel("Inspect employment tract", { exact: true })
      .selectOption("12095990000");
    assert.match(
      await page.getByLabel("Employment details", { exact: true }).innerText(),
      /12095990000[\s\S]*Total jobs\s*0[\s\S]*Unavailable/,
    );
    await page
      .getByRole("button", { name: "Close employment details" })
      .click();
    for (const scale of ["linear", "log", "sqrt"])
      await page.getByLabel("Employment height scale").selectOption(scale);
    await page.getByLabel("Employment measure").selectOption("jobs_per_km2");
    await page.getByLabel("Employment measure").selectOption("jobs_total");
    await page
      .getByRole("button", { name: "Four counties", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id === "employment-circles"),
    );
    assert.equal(await page.evaluate(() => window.map.getPitch()), 0);
    await expand();
    await page
      .getByRole("checkbox", {
        name: "Existing transit",
        exact: true,
        includeHidden: true,
      })
      .check();
    await page.getByLabel("Inspect transit", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Toggle employment 3D view" })
      .click();
    await page.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id === "employment-columns"),
    );
    assert.equal(
      await page.evaluate(
        () => window.deck._deck.props.layers.flat(Infinity).at(-1).id,
      ),
      "transit-station-labels",
    );
    const point = await page.evaluate(async () => {
      const data = await (
        await fetch("/data/employment_tracts.geojson")
      ).json();
      const f = data.features.find((f) => f.properties.jobs_total > 1000);
      window.map.jumpTo({ center: f.properties.point, zoom: 12, pitch: 0 });
      await new Promise((r) => setTimeout(r, 400));
      const p = window.map.project(f.properties.point);
      return { x: p.x, y: p.y, id: f.properties.GEOID };
    });
    assert.equal(
      await page.evaluate(
        (p) =>
          window.deck.pickObject({
            x: p.x,
            y: p.y,
            radius: 4,
            layerIds: ["employment-tracts"],
          })?.object?.properties.GEOID,
        point,
      ),
      point.id,
    );
    await page
      .getByLabel("Inspect employment tract", { exact: true })
      .selectOption(point.id);
    assert.match(
      await page.getByLabel("Employment details", { exact: true }).innerText(),
      /Three largest industry sectors/,
    );
    await page
      .getByRole("button", { name: "Close employment details" })
      .click();
    await page.getByRole("button", { name: "Orlando", exact: true }).click();
    await page
      .getByRole("button", { name: "Toggle employment 3D view" })
      .click();
    await page.waitForTimeout(400);
    const screenshot = `/tmp/sol-r-employment-${name}.png`;
    if (!process.env.SOL_R_REUSE_SCREENSHOTS || !existsSync(screenshot))
      await page.screenshot({ path: screenshot });
    if (width < 600) {
      const a = await page.locator(".employment-panel").boundingBox(),
        b = await page.locator(".transit-panel").boundingBox();
      assert.ok(a.y + a.height < b.y);
    }
    await expand();
    await page
      .getByRole("checkbox", {
        name: "Population",
        exact: true,
        includeHidden: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Inspect hexagon", exact: true })
      .waitFor();
    assert.equal(await page.locator(".employment-panel").count(), 0);
    assert.ok(
      await page
        .getByRole("checkbox", {
          name: "Existing transit",
          exact: true,
          includeHidden: true,
        })
        .isChecked(),
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS Employment ${name}: alternative demand, 489 columns, zero tract, sectors, scales, 2D area layer, picking and transit order`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
