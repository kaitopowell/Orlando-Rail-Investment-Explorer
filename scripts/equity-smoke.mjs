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
    await page.getByRole("checkbox", { name: "Equity", exact: true }).check();
    await page.getByLabel("Inspect equity tract", { exact: true }).waitFor();
    for (const measure of ["pct_poverty", "median_income", "pct_zero_vehicle"])
      await page.getByLabel("Equity measure").selectOption(measure);
    for (const id of ["12095016515", "12095990000"]) {
      await page
        .getByLabel("Inspect equity tract", { exact: true })
        .selectOption(id);
      assert.match(
        await page.getByLabel("Equity details", { exact: true }).innerText(),
        /small sample: fewer than 100 households/,
      );
      assert.match(
        await page.getByLabel("Equity details", { exact: true }).innerText(),
        /no households: value not computed/,
      );
    }
    const top = await page.evaluate(
      async () =>
        (
          await (await fetch("/data/equity_tracts.geojson")).json()
        ).features.find((f) => f.properties.median_income === 250001).properties
          .GEOID,
    );
    await page
      .getByLabel("Inspect equity tract", { exact: true })
      .selectOption(top);
    assert.match(
      await page.getByLabel("Equity details", { exact: true }).innerText(),
      /income top-coded/,
    );
    await page.getByRole("button", { name: "Toggle equity 3D view" }).click();
    assert.equal(
      await page.evaluate(
        () =>
          window.deck._deck.props.layers
            .flat(Infinity)
            .find((l) => l.id === "equity-tracts").props.extruded,
      ),
      false,
    );
    await page.getByRole("button", { name: "Close equity details" }).click();
    await page.locator(".equity-panel summary").click();
    const point = await page.evaluate(async () => {
      const f = (await (await fetch("/data/employment_tracts.geojson")).json())
        .features[0];
      window.map.jumpTo({ center: f.properties.point, zoom: 12, pitch: 0 });
      await new Promise((r) => setTimeout(r, 500));
      const p = window.map.project(f.properties.point);
      return { x: p.x, y: p.y, id: f.properties.GEOID };
    });
    assert.equal(
      await page.evaluate(
        (p) =>
          window.deck.pickObject({
            x: p.x,
            y: p.y,
            radius: 2,
            layerIds: ["equity-tracts"],
          })?.object?.properties.GEOID,
        point,
      ),
      point.id,
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    await page.locator(".equity-panel summary").click();
    await page.getByLabel("Equity details", { exact: true }).waitFor();
    assert.match(
      await page.getByLabel("Equity details", { exact: true }).innerText(),
      new RegExp(point.id),
    );
    await page.getByRole("button", { name: "Close equity details" }).click();
    for (const demand of ["Population", "Employment"]) {
      await expand();
      await page.getByRole("checkbox", { name: demand, exact: true }).check();
      await page.waitForFunction(
        () => window.deck._deck.props.layers.flat(Infinity).length > 1,
      );
      assert.equal(
        await page.evaluate(
          () => window.deck._deck.props.layers.flat(Infinity)[0].id,
        ),
        "equity-tracts",
      );
    }
    await expand();
    await page
      .getByRole("checkbox", { name: "Existing transit", exact: true })
      .check();
    await page.getByLabel("Inspect transit", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => window.deck._deck.props.layers.flat(Infinity).at(-1).id,
      ),
      "transit-station-labels",
    );
    if (
      await page.getByRole("button", { name: "Collapse sidebar" }).isVisible()
    )
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
    const boxes = await Promise.all(
      [".right-panels", ".view-controls"].map((s) =>
        page.locator(s).boundingBox(),
      ),
    );
    for (const b of boxes)
      assert.ok(
        b.x >= 0 &&
          b.x + b.width <= width &&
          b.y >= 0 &&
          b.y + b.height <= height,
      );
    const panels = await page.locator('.right-panel').evaluateAll(es => es.map(e => {const r=e.getBoundingClientRect();return {y:r.y,bottom:r.bottom};}).sort((a,b)=>a.y-b.y));
    for(let i=1;i<panels.length;i++) assert.ok(panels[i-1].bottom<=panels[i].y);
    // Invoke actual layer event callbacks and verify React inspector/highlight updates.
    await page.evaluate(() => {
      const l = window.deck._deck.props.layers.flat(Infinity)[0];
      l.props.onHover({ object: l.props.data.features[0] });
      l.props.onClick({ object: l.props.data.features[0] });
    });
    await page.getByLabel("Equity details", { exact: true }).waitFor();
    assert.match(
      await page.getByLabel("Equity details", { exact: true }).innerText(),
      /ACS 5-year estimates 2020-2024/,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (!existsSync(`work/equity-${name}.png`))
      await page.screenshot({ path: `work/equity-${name}.png` });
    assert.deepEqual(errors, []);
    console.log(
      `PASS Equity ${name}: measures, flags, flat 3D, independent demand/transit order, events and layout`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
