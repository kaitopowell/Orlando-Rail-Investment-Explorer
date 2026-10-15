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
    const start = Date.now();
    await page
      .getByRole("checkbox", { name: "Population", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Inspect hexagon", exact: true })
      .waitFor();
    await page.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id === "population-hexagons" && l.props.extruded),
    );
    const loaded = Date.now() - start;
    assert.equal(
      await page.getByLabel("Population source", { exact: true }).inputValue(),
      "hexagons",
    );
    const info = await page.evaluate(() => {
      const l = window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "population-hexagons");
      const f = l.props.data.features.find(
        (f) => f.properties.population > 1000,
      );
      return {
        count: l.props.data.features.length,
        p: f.properties,
        center: f.geometry.coordinates[0]
          .slice(0, 6)
          .reduce((a, p) => [a[0] + p[0] / 6, a[1] + p[1] / 6], [0, 0]),
      };
    });
    assert.equal(info.count, 7896);
    await page.getByLabel("Inspect H3 ID").fill(info.p.h3);
    await page
      .getByRole("button", { name: "Inspect hexagon", exact: true })
      .click();
    const details = await page
      .getByLabel("Hexagon details", { exact: true })
      .innerText();
    assert.match(details, /Modeled estimate, Kontur Population/);
    assert.match(details, /entire tract, not this hexagon/);
    assert.ok(details.includes(info.p.tract_geoid));
    await page.getByRole("button", { name: "Close hexagon details" }).click();
    for (const scale of ["linear", "log", "sqrt"])
      await page.getByLabel("Hexagon height scale").selectOption(scale);
    await page.getByLabel("Vertical exaggeration", { exact: true }).focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
    await page
      .getByRole("button", { name: "Four counties", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id === "population-hexagons" && !l.props.extruded),
    );
    await page
      .getByRole("button", { name: "Toggle population 3D view" })
      .click();
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
    await page.evaluate(
      (center) => window.map.jumpTo({ center, zoom: 11, pitch: 45 }),
      info.center,
    );
    await page.waitForTimeout(500);
    const point = await page.evaluate(({ center, p }) => {
      const layer = window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "population-hexagons");
      const f = layer.props.data.features.find((f) => f.properties.h3 === p.h3);
      const [x, y] = window.deck._deck
        .getViewports()[0]
        .project([...center, layer.props.getElevation(f)]);
      return { x, y };
    }, info);
    assert.equal(
      await page.evaluate(
        (point) =>
          window.deck.pickObject({
            ...point,
            radius: 4,
            layerIds: ["population-hexagons"],
          })?.object?.properties.h3,
        point,
      ),
      info.p.h3,
    );
    await page.getByRole("button", { name: "Orlando", exact: true }).click();
    await page
      .getByRole("button", { name: "Toggle population 3D view" })
      .click();
    await page.waitForTimeout(400);
    const screenshot = `/tmp/sol-r-kontur-${name}.png`;
    if (!process.env.SOL_R_REUSE_SCREENSHOTS || !existsSync(screenshot))
      await page.screenshot({ path: screenshot });
    if (width < 600) {
      const hex = await page.locator(".hexagon-panel").boundingBox();
      const transit = await page.locator(".transit-panel").boundingBox();
      assert.ok(hex.y + hex.height < transit.y);
    }
    await page
      .getByLabel("Population source", { exact: true })
      .selectOption("tracts");
    await page.getByLabel("Inspect tract", { exact: true }).waitFor();
    assert.match(
      await page.locator(".population-legend").innerText(),
      /Height and color mean density/,
    );
    await page
      .getByLabel("Population source", { exact: true })
      .selectOption("hexagons");
    await page
      .getByRole("button", { name: "Inspect hexagon", exact: true })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS Kontur ${name}: loaded ${loaded}ms; count, source switch, scales, inspector, picking, modes and transit order`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
