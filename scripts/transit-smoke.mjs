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
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /deck|WebGL/.test(m.text()))
        errors.push(m.text());
    });
    await page.addInitScript(() => {
      window.addEventListener(
        "sol-r:deck-ready",
        (e) => (window.deck = e.detail),
      );
      window.addEventListener(
        "sol-r:map-ready",
        (e) => (window.map = e.detail),
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
      .getByRole("checkbox", { name: "Existing transit", exact: true })
      .check();
    await page.getByLabel("Inspect transit", { exact: true }).waitFor();
    assert.equal(await page.locator(".transit-panel option").count(), 21);
    await page
      .getByLabel("Inspect transit", { exact: true })
      .selectOption("brightline-stations-0");
    assert.match(
      await page.getByLabel("Transit details", { exact: true }).innerText(),
      /Operator: Brightline[\s\S]*Intercity service/,
    );
    await expand();
    await page
      .getByRole("checkbox", { name: "Population", exact: true })
      .check();
    await page
      .getByLabel("Population source", { exact: true })
      .selectOption("tracts");
    await page.getByLabel("Inspect tract", { exact: true }).waitFor();
    await page.waitForTimeout(700);
    const props = await page.evaluate(() => {
      const ls = window.deck._deck.props.layers.flat(Infinity);
      return {
        last: ls.at(-1).id,
        depth: ls.find((l) => l.id === "transit-core").props.parameters
          .depthCompare,
        glow: ls.find((l) => l.id === "transit-station-glow").props.getRadius,
      };
    });
    assert.deepEqual(props, {
      last: "transit-station-labels",
      depth: "always",
      glow: 14,
    });
    await page.getByRole("button", { name: "Close transit details" }).click();
    // Actual station pick/click above Population, with UI kept away from the target.
    await page.evaluate(() =>
      window.map.jumpTo({
        center: [-81.307619, 28.411698],
        zoom: 12,
        pitch: 45,
      }),
    );
    await page.waitForTimeout(400);
    const point = await page.evaluate(() => {
      const [x, y] = window.deck._deck
        .getViewports()[0]
        .project([-81.307619, 28.411698, 5]);
      return { x, y };
    });
    const picked = await page.evaluate(
      (p) =>
        window.deck.pickObject({
          ...p,
          radius: 5,
          layerIds: ["transit-stations"],
        })?.object?.properties.name,
      point,
    );
    assert.equal(picked, "Orlando");
    if (
      await page.getByRole("button", { name: "Collapse sidebar" }).isVisible()
    )
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.evaluate(() =>
      window.map.jumpTo({
        center: [-81.307619, 28.411698],
        zoom: 12,
        pitch: 45,
      }),
    );
    await page.waitForTimeout(300);
    const target = { x: width < 600 ? 65 : 720, y: 450 };
    await page.evaluate((target) => {
      const p = window.map.project([-81.307619, 28.411698]);
      window.map.panBy([p.x - target.x, p.y - target.y], { duration: 0 });
    }, target);
    await page.waitForTimeout(250);
    await page.mouse.click(target.x, target.y);
    await page.getByLabel("Transit details", { exact: true }).waitFor();
    assert.match(
      await page.getByLabel("Transit details", { exact: true }).innerText(),
      /Orlando/,
    );
    await page.getByRole("button", { name: "Close transit details" }).click();
    await page
      .getByRole("button", { name: "Four counties", exact: true })
      .click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.map.getPitch()), 0);
    const screenshot = `/tmp/sol-r-transit-${name}.png`;
    if (!process.env.SOL_R_REUSE_SCREENSHOTS || !existsSync(screenshot))
      await page.screenshot({ path: screenshot });
    if (width < 600) {
      const panel = await page.locator(".transit-panel").boundingBox();
      const controls = await page.locator(".view-controls").boundingBox();
      assert.ok(panel.y + panel.height < controls.y);
    }
    await expand();
    await page
      .getByRole("checkbox", { name: "Population", exact: true })
      .uncheck();
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(() =>
        window.deck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id === "transit-core"),
      ),
    );
    await page
      .getByRole("checkbox", { name: "Existing transit", exact: true })
      .uncheck();
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".transit-panel").count(), 0);
    assert.ok(
      await page.evaluate(
        () =>
          !window.deck._deck.props.layers
            .flat(Infinity)
            .some((l) => l.id.startsWith("transit-")),
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS transit ${name}: local features, inspector, depth/order, reduced motion, 2D/3D and independent cleanup`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
