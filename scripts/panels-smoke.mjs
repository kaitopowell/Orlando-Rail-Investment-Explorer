import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const style = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#10171c" },
    },
  ],
};
try {
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [380, 844],
  ]) {
    const p = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      window.addEventListener(
        "sol-r:map-ready",
        (e) => (window.map = e.detail),
      );
      window.addEventListener(
        "sol-r:deck-ready",
        (e) => (window.deck = e.detail),
      );
    });
    await p.route("https://basemaps.cartocdn.com/**", (r) =>
      r.fulfill({ json: style }),
    );
    await p.goto("http://localhost:5173");
    await p.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
    const sidebar = async () => {
      const b = p.getByRole("button", { name: "Expand sidebar" });
      if (await b.isVisible()) await b.click();
    };
    await sidebar();
    await p.getByRole("checkbox", { name: "Population", exact: true }).check();
    await p.getByLabel("Inspect H3 ID").waitFor();
    await sidebar();
    await p
      .getByRole("checkbox", { name: "Proposed rail network", exact: true })
      .check();
    await p.locator(".rail-summary").waitFor();
    await sidebar();
    await p.getByRole("checkbox", {name: "Equity", exact: true}).check();
    if (await p.getByRole("button", {name: "Expand rail controls"}).isVisible()) await p.getByRole("button", {name: "Expand rail controls"}).click();
    const close = p.getByRole("button", { name: "Collapse sidebar" });
    if (await close.isVisible()) await close.click();
    await p.evaluate(() => window.map.jumpTo({ pitch: 0 }));
    await p.waitForFunction(() => window.deck._deck.props.layers.flat(Infinity).find(l => l.id === 'population-hexagons')?.props.opacity === .6);
    const popHeader = p.locator('[data-panel="population"] > h2 button');
    await popHeader.click();
    await p.getByText('Population display settings', {exact:true}).click();
    await p.getByLabel('Population opacity', {exact:true}).fill('25');
    await p.waitForFunction(() => window.deck._deck.props.layers.flat(Infinity).find(l => l.id === 'population-hexagons')?.props.opacity === .25);
    await p.getByRole('button', {name:'Use automatic opacity'}).click();
    await p.getByRole('button', {name:'Expand rail controls'}).click();
    await p.evaluate(() => window.map.jumpTo({ pitch: 45 }));
    await p.waitForFunction(
      () =>
        !window.deck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id.startsWith("population-hexagon")),
    );
    assert.equal(await p.getByLabel("Inspect H3 ID").isVisible(), false);
    assert.match(await p.locator(".rail-summary").innerText(), /142,000 commuters save 20\+ min/);
    assert.match(await p.locator(".rail-summary").innerText(), /Not a traffic forecast/);
    await p.locator(".network-details > summary").click();
    await p.getByLabel("Show population", { exact: true }).check();
    await p.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id.startsWith("population-hexagon")),
    );
    await p.getByLabel("Show population", { exact: true }).uncheck();
    await p.waitForFunction(
      () =>
        !window.deck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id.startsWith("population-hexagon")),
    );
    await p.waitForFunction(() => window.deck._deck.props.layers.flat(Infinity).some(l=>l.id === "equity-tracts"));
    assert.ok(await p.evaluate(() => {
      const layers=window.deck._deck.props.layers.flat(Infinity), equity=layers.find(l=>l.id === "equity-tracts"), rail=layers.find(l=>l.id === "rail-plan-core");
      return equity.props.beforeId === rail.props.beforeId && layers.indexOf(equity) < layers.indexOf(rail);
    }), "Equity must share the rail slot and draw underneath, including when population is suppressed");
    const alpha = () =>
      p.evaluate(() => {
        const l = window.deck._deck.props.layers
          .flat(Infinity)
          .find((l) => l.id === "rail-plan-core");
        return l.props.data.features.map((f) => l.props.getLineColor(f)[3]);
      });
    assert.ok((await alpha()).every((a) => a === 255));
    await p.locator(".network-lines summary").click();
    await p.locator(".network-lines button").first().focus();
    assert.ok((await alpha()).some((a) => a < 255));
    await p.locator(".network-lines summary").click();
    assert.ok((await alpha()).every((a) => a === 255));
    const population = p.locator('[data-panel="population"] > h2 button');
    await population.focus();
    await p.keyboard.press("Enter");
    await p.getByLabel("Inspect H3 ID").waitFor();
    assert.equal(await p.locator(".rail-summary").isVisible(), false);
    await p.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id.startsWith("population-hexagon")),
    );
    await p.getByRole("button", { name: "Expand rail controls" }).click();
    assert.equal(
      await p
        .locator('.right-panel-heading button[aria-expanded="true"]')
        .count(),
      1,
    );
    const box = await p.locator(".right-panels").boundingBox();
    for (const selector of [".view-controls", ".map-status"]) {
      const b = await p.locator(selector).boundingBox();
      assert.ok(
        box.y + box.height <= b.y ||
          box.y >= b.y + b.height ||
          box.x + box.width <= b.x ||
          box.x >= b.x + b.width,
        `${width}: ${selector} overlap`,
      );
    }
    const panels = await p.locator(".right-panel").evaluateAll((es) =>
      es
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { y: r.y, bottom: r.bottom };
        })
        .sort((a, b) => a.y - b.y),
    );
    for (let i = 1; i < panels.length; i++)
      assert.ok(panels[i].y >= panels[i - 1].bottom);
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS panels ${width}x${height}: accordion/keyboard, opaque nonoverlapping column, controls/badge clearance, population override/restoration, wording, full opacity and cleared line emphasis`,
    );
    await p.close();
  }
} finally {
  await browser.close();
}
