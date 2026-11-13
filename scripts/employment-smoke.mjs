import assert from "node:assert/strict";
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
          sources: {"test-label-source": {type: "geojson", data: {type: "FeatureCollection", features: []}}},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#10171c" },
            },
            {id: "test-labels", type: "symbol", source: "test-label-source"},
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
    await page.getByRole("checkbox", {name: "Employment", exact: true}).check();
    await page.getByLabel("Employment 3D source").waitFor();
    assert.equal(await page.getByLabel("Employment 3D source").inputValue(), "blocks");
    await page.getByRole("button", {name: "Inspect employment block", exact: true}).waitFor();
    assert.equal(await page.getByLabel("Employment height scale").inputValue(), "sqrt");
    assert.equal(await page.getByLabel("Clip tallest needles").isChecked(), true);
    const blocks = await page.evaluate(async () => {
      const data = await (await fetch("/data/employment_blocks.geojson")).json();
      const layer = window.deck._deck.props.layers.flat(Infinity).find(l => l.id === "employment-block-needles");
      const values = data.features.map(f => f.properties.jobs_total).sort((a,b) => a-b);
      const index = (values.length-1)*.99, low = Math.floor(index);
      const cap = values[low] + (values[Math.ceil(index)]-values[low])*(index-low);
      const highest = data.features.reduce((a,b) => a.properties.jobs_total > b.properties.jobs_total ? a : b);
      window.blockTestFeature = highest;
      return {count: layer.props.data.length, max: values.at(-1), cap,
        clipped: values.filter(v => v > cap).length, id: highest.properties.w_geocode,
        tract: highest.properties.tract_geoid, county: highest.properties.county,
        elevation: layer.props.getElevation(highest),
        minimum: Math.min(...data.features.map(f => layer.props.getElevation(f))),
        blend: layer.props.parameters.blendColorDstFactor,
        before: layer.props.beforeId, label: window.map.getStyle().layers.find(l => l.type === "symbol")?.id};
    });
    assert.equal(blocks.count, 15574);
    assert.equal(blocks.elevation, 12000);
    assert.ok(blocks.minimum >= 180);
    assert.equal(blocks.blend, "one");
    assert.equal(blocks.before, "test-labels");
    assert.equal(blocks.before, blocks.label);
    const picked = await page.evaluate(async () => {
      const f = window.blockTestFeature;
      window.map.jumpTo({center: f.geometry.coordinates, zoom: 14, pitch: 45});
      await new Promise(r => setTimeout(r, 500));
      const p = window.map.project(f.geometry.coordinates);
      return window.deck.pickObject({x:p.x, y:p.y, radius:4, layerIds:["employment-block-needles"]})?.object?.properties.w_geocode;
    });
    assert.match(picked, /^\d{15}$/);
    await page.getByRole("button", {name: "Orlando", exact: true}).click();
    if (await page.locator('[data-panel="employment"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="employment"] > h2 button').click();
    await page.getByRole("button", {name: "Toggle employment 3D view"}).click();
    await page.getByRole("button", {name: "Inspect employment block", exact: true}).waitFor();
    assert.match(await page.getByLabel("Employment clipping legend").innerText(), new RegExp(`${blocks.clipped} needles clipped`));
    await page.getByLabel("Employment block ID").fill(blocks.id);
    await page.getByRole("button", {name: "Inspect employment block", exact: true}).click();
    const details = await page.getByLabel("Employment block details", {exact: true}).innerText();
    for (const value of [blocks.id, blocks.tract, blocks.county, "Three largest industry sectors", "block-level values include privacy noise"])
      assert.ok(details.includes(value));
    await page.getByRole("button", {name: "Close employment block details"}).click();
    for (const scale of ["linear", "log", "sqrt"])
      await page.getByLabel("Employment height scale").selectOption(scale);
    await page.getByLabel("Clip tallest needles").uncheck();
    assert.match(await page.getByLabel("Employment clipping legend").innerText(), /0 needles clipped/);
    await page.getByLabel("Employment opacity").fill("0.35");
    await page.waitForFunction(() => window.deck._deck.props.layers.flat(Infinity).find(l => l.id === "employment-block-needles")?.props.opacity === .35);
    await page.getByLabel("Clip tallest needles").check();
    await page.evaluate(() => {
      const layer = window.deck._deck.props.layers.flat(Infinity).find(l => l.id === "employment-block-needles");
      layer.props.onHover({object: window.blockTestFeature});
    });
    await page.getByLabel("Employment block details", {exact: true}).waitFor();
    await page.evaluate(() => {
      const layer = window.deck._deck.props.layers.flat(Infinity).find(l => l.id === "employment-block-needles");
      layer.props.onClick({object: window.blockTestFeature});
      layer.props.onHover({object: null});
    });
    assert.ok((await page.getByLabel("Employment block details", {exact: true}).innerText()).includes(blocks.id));
    await page.getByRole("button", {name: "Close employment block details"}).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".employment-blocks-panel").evaluate(el => getComputedStyle(el).zIndex), "2");
    // One block-view capture per viewport, never repeated during this run.
    await page.screenshot({path: `/tmp/sol-r-employment-blocks-${name}.png`});
    await page.getByLabel("Employment 3D source").selectOption("tracts");
    await page.route("**/data/employment_blocks.geojson", r => r.abort());
    await page.getByLabel("Employment 3D source").selectOption("blocks");
    await page.getByRole("alert").filter({hasText: "Employment block data unavailable"}).waitFor();
    await page.unroute("**/data/employment_blocks.geojson");
    await page.getByRole("button", {name: "Retry employment blocks"}).click();
    await page.getByRole("button", {name: "Inspect employment block", exact: true}).waitFor();
    await page.getByLabel("Employment 3D source").selectOption("tracts");
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
    if (await page.locator('[data-panel="employment"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="employment"] > h2 button').click();
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
    if (await page.locator('[data-panel="employment"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="employment"] > h2 button').click();
    await page
      .getByRole("button", { name: "Toggle employment 3D view" })
      .click();
    await page.waitForTimeout(400);

    if (width < 600) {
      const a = await page.locator(".right-panels").boundingBox(),
        b = await page.locator(".view-controls").boundingBox();
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
    assert.equal(await page.locator(".employment-panel").count(), 1);
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
      `PASS Employment ${name}: 15,574 block needles, clipping/opacity/source/inspection, independent demand, 489 tract columns, zero tract, sectors, scales, 2D area layer, picking and transit order`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
