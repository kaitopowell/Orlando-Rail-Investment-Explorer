import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  for (const [name, width, height] of [
    ["laptop", 1440, 900],
    ["phone", 390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /deck:|deck.gl|WebGL/.test(m.text()))
        errors.push(m.text());
    });
    await page.addInitScript(() => {
      window.addEventListener(
        "sol-r:map-ready",
        (e) => (window.solRMap = e.detail),
      );
      window.addEventListener(
        "sol-r:deck-ready",
        (e) => (window.solRDeck = e.detail),
      );
    });
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
    await page
      .getByRole("status")
      .filter({ hasText: "BASEMAP LIVE" })
      .waitFor();
    if (width < 600)
      await page.getByRole("button", { name: "Expand sidebar" }).click();
    assert.match(
      await page.getByRole("region", { name: "Data layers", exact: true }).locator(".section-heading").innerText(),
      /06 LIVE \/ 00 PLANNED/,
    );
    await page
      .getByRole("checkbox", { name: "Population", exact: true })
      .check();
    await page
      .getByLabel("Population source", { exact: true })
      .selectOption("tracts");
    await page.getByLabel("Inspect tract", { exact: true }).waitFor();
    assert.match(
      await page.locator(".population-legend").innerText(),
      /Square-root scale/,
    );
    assert.equal(
      await page
        .getByLabel("Inspect tract", { exact: true })
        .locator("option")
        .count(),
      491,
    );
    await page.waitForFunction(() => window.solRMap.getPitch() === 45);
    assert.equal(await page.evaluate(() => window.solRMap.getPitch()), 45);
    await page
      .getByRole("button", { name: "Four counties", exact: true })
      .click();
    assert.ok(
      await page.evaluate(
        () =>
          Math.abs(window.solRMap.getZoom() - window.solRMap.getMinZoom()) <
          0.001,
      ),
    );
    assert.equal(await page.evaluate(() => window.solRMap.getPitch()), 0);
    await page.waitForTimeout(250);
    assert.match(
      await page.locator(".population-legend").innerText(),
      /Column width adapts/,
    );
    assert.ok(
      await page.evaluate(() =>
        window.solRDeck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id === "population-columns"),
      ),
    );
    await page
      .getByRole("button", { name: "Toggle population 3D view" })
      .click();
    await page.waitForFunction(() =>
      window.solRDeck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id === "population-tracts" && l.props.extruded),
    );
    assert.equal(await page.evaluate(() => window.solRMap.getPitch()), 45);
    assert.match(
      await page.locator(".population-legend").innerText(),
      /Height and color mean density/,
    );
    const extrusions = await page.evaluate(() => {
      const layers = window.solRDeck._deck.props.layers.flat(Infinity);
      const tract = layers.find((l) => l.id === "population-tracts");
      const zero = tract.props.data.features.find(
        (f) => f.properties.pop_est === 0,
      );
      return {
        count: tract.props.data.features.length,
        pickable: tract.props.pickable,
        zeroHeight: tract.props.getElevation(zero),
        hasColumns: layers.some((l) => l.id === "population-columns"),
        hasBeams: layers.some((l) => l.id.includes("beam")),
        hasEdges: layers.some((l) => l.id === "population-roof-edges"),
        lit: window.solRDeck._deck.props.effects.length > 0,
      };
    });
    assert.deepEqual(extrusions, {
      count: 490,
      pickable: true,
      zeroHeight: 0,
      hasColumns: false,
      hasBeams: false,
      hasEdges: true,
      lit: true,
    });
    // One 3D capture per device; no repeated overview screenshots.
    await page.waitForTimeout(350);
    const screenshot = `/tmp/sol-r-extrusions-${name}.png`;
    if (!process.env.SOL_R_REUSE_SCREENSHOTS || !existsSync(screenshot))
      await page.screenshot({ path: screenshot });
    // Verify real deck picking and actual click inspection, including the zero tract.
    for (const id of ["12069030102", "12095990000"]) {
      if (
        await page.getByRole("button", { name: "Collapse sidebar" }).isVisible()
      )
        await page.getByRole("button", { name: "Collapse sidebar" }).click();
      const point = await page.evaluate(async (id) => {
        const { tractCentroid } = await import("/src/data/population.ts");
        const data = await (
          await fetch("/data/population_tracts.geojson")
        ).json();
        const f = data.features.find((f) => f.properties.GEOID === id);
        window.solRMap.jumpTo({
          center: tractCentroid(f.geometry),
          zoom: 12,
          pitch: 45,
        });
        const { tractHeight } = await import("/src/map/populationVisuals.ts");
        // Allow the deck viewport to synchronize after the MapLibre jump.
        await new Promise((resolve) => setTimeout(resolve, 350));
        const [x, y] = window.solRDeck._deck
          .getViewports()[0]
          .project([
            ...tractCentroid(f.geometry),
            tractHeight(f.properties.density),
          ]);
        return { x, y };
      }, id);
      await page.waitForTimeout(350);
      const pick = await page.evaluate(
        ({ x, y }) =>
          window.solRDeck.pickObject({
            x,
            y,
            layerIds: ["population-tracts"],
            radius: 4,
          })?.object?.properties?.GEOID,
        point,
      );
      assert.equal(
        pick,
        id,
        `${name}: zero and populated polygons are pickable`,
      );
      // Move panel away from the map center only via its normal close-free location;
      // click a visible polygon point to the left of the panel on a phone.
      const clickPoint = width < 600 ? { x: 6, y: height / 2 } : point;
      if (width < 600)
        await page.evaluate(
          ({ point, clickPoint }) =>
            window.solRMap.panBy(
              [point.x - clickPoint.x, point.y - clickPoint.y],
              { duration: 0 },
            ),
          { point, clickPoint },
        );
      await page.waitForTimeout(150);
      await page.mouse.move(clickPoint.x, clickPoint.y);
      await page.locator(".population-hover").filter({ hasText: id }).waitFor();
      await page.mouse.click(clickPoint.x, clickPoint.y);
      await page
        .getByRole("heading", { name: `Tract ${id}`, exact: true })
        .waitFor();
      if (id === "12095990000") {
        assert.match(
          await page.locator(".tract-inspector").innerText(),
          /0 ± 15/,
        );
        assert.match(
          await page.locator(".tract-inspector").innerText(),
          /Unavailable/,
        );
      }
      await page.getByRole("button", { name: "Close tract details" }).click();
    }
    await page
      .getByLabel("Inspect tract", { exact: true })
      .selectOption("12095990000");
    assert.match(
      await page.locator(".population-source").innerText(),
      /ACS 2024 5-year/,
    );
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page
      .getByRole("checkbox", { name: "Population", exact: true })
      .uncheck();
    assert.equal(await page.locator(".population-panel").count(), 0);
    assert.equal(await page.evaluate(() => window.solRMap.getPitch()), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    // A missing population resource must not disable the basemap or invent a layer.
    await page.reload();
    await page
      .getByRole("status")
      .filter({ hasText: "BASEMAP LIVE" })
      .waitFor();
    await page.route("**/data/population_tracts.geojson", (r) => r.abort());
    if (width < 600)
      await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page
      .getByRole("checkbox", { name: "Population", exact: true })
      .check();
    await page
      .getByLabel("Population source", { exact: true })
      .selectOption("tracts");
    await page
      .getByRole("alert")
      .filter({ hasText: "Population data could not load" })
      .waitFor();
    await page.unroute("**/data/population_tracts.geojson");
    await page.getByRole("button", { name: "Retry population" }).click();
    await page
      .getByLabel("Population source", { exact: true })
      .selectOption("tracts");
    await page.getByLabel("Inspect tract", { exact: true }).waitFor();
    console.log(
      `PASS ${name}: 3D extrusions, 2D preservation, picking and click inspection including zero tract, legend, toggle cleanup, error and retry.`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
