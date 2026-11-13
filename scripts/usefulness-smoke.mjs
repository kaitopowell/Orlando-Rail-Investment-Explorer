import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  shortestRailPath,
  commuteBaseline,
} from "../src/data/railUsefulness.ts";
const plan = JSON.parse(readFileSync("public/data/rail_network.json"));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  for (const [width, height] of [
    [1366, 768],
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
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#10171c" },
            },
          ],
        },
      }),
    );
    await p.goto("http://localhost:5173");
    await p.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
    const expand = p.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible()) await expand.click();
    await p
      .getByRole("checkbox", { name: "Proposed rail network", exact: true })
      .check();
    await p.locator(".usefulness-headlines").waitFor();
    const close = p.getByRole("button", { name: "Collapse sidebar" });
    if (await close.isVisible()) await close.click();
    assert.match(
      await p.locator(".usefulness-headlines").innerText(),
      /142,000 commuters save 20\+ min.*53.0%/s,
    );
    assert.match(
      await p.locator(".usefulness-headlines").innerText(),
      /24,100 commuters.*3.2%/s,
    );
    assert.equal(await p.getByLabel("Train speed").inputValue(), "20");
    assert.equal(
      await p.locator(".network-details").getAttribute("open"),
      null,
    );
    assert.doesNotMatch(
      await p.locator(".rail-summary").innerText(),
      /job-minutes|min per worker/,
    );
    const headlines = await p.locator(".usefulness-headlines").boundingBox(),
      column = await p.locator(".right-panels").boundingBox();
    assert.ok(
      headlines.y >= column.y &&
        headlines.y + headlines.height <= column.y + column.height,
      "both headline numbers and caption visible without scrolling",
    );
    await p.locator(".network-details > summary").click();
    assert.equal(await p.locator(".commute-bars meter").count(), 3);
    assert.equal(await p.locator(".improved-commutes button").count(), 5);
    await p.getByRole("button", { name: "Show all 8" }).click();
    assert.equal(await p.locator(".improved-commutes button").count(), 8);
    await p.locator(".improved-commutes button").first().focus();
    await p.keyboard.press("Enter");
    const sc = plan.scenarios.find((s) => s.id === "low-oh20-minutes"),
      pair = sc.usefulness["10000"].top_pairs[0];
    const path = shortestRailPath(plan, sc, 10000, pair.home, pair.work),
      baseline = commuteBaseline(plan, pair.home, pair.work);
    await p.waitForFunction(() =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .some((l) => l.id === "rail-plan-commute-path"),
    );
    assert.match(
      await p.locator(".commute-result").innerText(),
      new RegExp(`With the plan: ${Math.round(path.ride + 20)} min`),
    );
    assert.match(
      await p.locator(".commute-result").innerText(),
      new RegExp(`Today: ${Math.round(baseline.transit)} min`),
    );
    assert.equal(
      await p.evaluate(
        () =>
          window.deck._deck.props.layers
            .flat(Infinity)
            .find((l) => l.id === "rail-plan-commute-ends").props.data.length,
      ),
      2,
    );
    const edgeCount = await p.evaluate(
      () =>
        window.deck._deck.props.layers
          .flat(Infinity)
          .find((l) => l.id === "rail-plan-commute-path").props.data.length,
    );
    assert.equal(edgeCount, path.edges.length);
    await p.getByLabel("Train speed").selectOption("30");
    const fast = plan.scenarios.find((s) => s.id === "low-oh20-minutes-s30"),
      fastPath = shortestRailPath(plan, fast, 10000, pair.home, pair.work);
    await p.waitForFunction(
      (expected) =>
        document
          .querySelector(".commute-result")
          ?.textContent.includes(`With the plan: ${expected} min`),
      Math.round(fastPath.ride + 20),
    );
    await p.getByLabel("Rail drawing style").selectOption("geographic");
    assert.equal(await p.locator(".commute-result").count(), 1);
    await p.getByLabel("Commute to").selectOption(pair.home);
    assert.match(
      await p.locator(".commute-result").innerText(),
      /Rail ride 0 min \+ 20 min wait\/access once/,
    );
    await p.getByRole("button", { name: "Clear commute" }).click();
    assert.equal(
      await p.evaluate(
        () =>
          window.deck._deck.props.layers
            .flat(Infinity)
            .filter((l) => l.id.startsWith("rail-plan-commute")).length,
      ),
      0,
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const box = await p.locator(".right-panels").boundingBox(),
      controls = await p.locator(".view-controls").boundingBox();
    assert.ok(box.y + box.height <= controls.y);
    assert.deepEqual(errors, []);
    console.log(
      `PASS usefulness ${width}: published counts, collapsed details, bars, keyboard top pair, full list, weighted baseline, speed/path recomputation, endpoints, geometry toggle, overhead once, cleanup and layout`,
    );
    await p.close();
  }
} finally {
  await browser.close();
}
