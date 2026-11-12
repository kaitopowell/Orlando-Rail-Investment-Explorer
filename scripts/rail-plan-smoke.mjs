import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const fixture = {
  version: 8,
  sources: {
    labels: {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#10171c" },
    },
    {
      id: "test-labels",
      type: "symbol",
      source: "labels",
      minzoom: 5,
      paint: { "text-opacity": 0.8 },
    },
  ],
};
const init = async (p) => {
  await p.addInitScript(() => {
    window.addEventListener("sol-r:map-ready", (e) => (window.map = e.detail));
    window.addEventListener(
      "sol-r:deck-ready",
      (e) => (window.deck = e.detail),
    );
  });
  await p.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({ json: fixture }),
  );
  await p.goto("http://localhost:5173");
  await p.getByRole("status").filter({ hasText: "BASEMAP LIVE" }).waitFor();
};
const ids = (p) =>
  p.evaluate(
    () =>
      window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "rail-plan-core")
        ?.props.data.features.map((f) => f.properties.id) ?? [],
  );
try {
  for (const [name, width, height] of [
    ["laptop", 1440, 1080],
    ["phone", 380, 844],
  ]) {
    const p = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [],
      requests = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => { if (m.text().includes("same key")) errors.push(m.text()); });
    p.on("request", (r) => requests.push(r.url()));
    await init(p);
    const expand = async () => {
      const b = p.getByRole("button", { name: "Expand sidebar" });
      if (await b.isVisible()) await b.click();
    };
    await expand();
    await p
      .getByRole("checkbox", { name: "Proposed rail network", exact: true })
      .check();
    await p.locator(".rail-summary").waitFor();
    assert.match(await p.locator(".rail-summary").innerText(), /39 links/);
    assert.match(await p.locator(".rail-summary").innerText(), /5,968,066.1/);
    assert.equal((await ids(p)).length, 39);
    assert.equal(
      await p.getByLabel("Rail drawing style").inputValue(),
      "schematic",
    );
    assert.equal(await p.locator(".network-lines").getAttribute("open"), null);
    assert.equal(
      await p.locator(".network-details").getAttribute("open"),
      null,
    );
    if (name === "laptop") {
      const summary = await p.locator(".rail-summary").boundingBox();
      assert.ok(summary.y + summary.height < height);
      assert.equal(
        await p
          .locator(".network-panel")
          .evaluate((e) => e.scrollHeight <= e.clientHeight),
        true,
      );
    }
    await p.locator(".network-lines summary").click();
    assert.equal(await p.locator(".network-lines button").count(), 10);
    await p.locator(".network-lines button").first().focus();
    const alphas = await p.evaluate(() => {
      const l = window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "rail-plan-core");
      return l.props.data.features.map((f) => l.props.getLineColor(f)[3]);
    });
    assert.ok(Math.min(...alphas) < Math.max(...alphas));
    await p.getByRole("button", { name: "$2.5B", exact: true }).click();
    const low = await ids(p);
    assert.equal(low.length, 8);
    await p.getByRole("button", { name: "$30B", exact: true }).click();
    assert.equal((await ids(p)).length, 89);
    for (const id of low) assert.ok((await ids(p)).includes(id));
    // A route can recur later in build order with different newly built links.
    const repeated = await p.evaluate(async () => {
      const plan = await (await fetch("/data/rail_network.json")).json();
      const steps = plan.scenarios.find((s) => s.id === "low-oh20-minutes").steps;
      const index = steps.findIndex((s, i) => steps.slice(0, i).some((prior) => prior.route_id === s.route_id));
      return { index, count: steps[index].new_link_ids.length };
    });
    assert.ok(repeated.index > 0);
    await p.locator(".rail-build-order summary").click();
    await p.locator(".rail-build-order button").nth(repeated.index).focus();
    await p.keyboard.press("Enter");
    await p.locator(".rail-inspection").waitFor();
    assert.equal(await p.locator(".rail-inspection > div").count(), repeated.count);
    await p.getByRole("button", { name: "Close rail inspection" }).click();
    await p.locator(".rail-build-order summary").click();
    await p.getByRole("button", { name: "$10B", exact: true }).click();
    await p.getByLabel("Core network only", { exact: true }).check();
    assert.equal((await ids(p)).length, 18);
    await p.getByLabel("Core network only", { exact: true }).uncheck();
    await p.getByLabel("Rail drawing style").selectOption("geographic");
    assert.equal(
      await p.evaluate(() =>
        window.map.getPaintProperty("test-labels", "text-opacity"),
      ),
      0.8,
    );
    assert.equal(
      await p.evaluate(() => window.map.getLayer("test-labels").minzoom),
      5,
    );
    await p.getByLabel("Rail drawing style").selectOption("schematic");
    assert.equal(
      await p.evaluate(() =>
        window.map.getPaintProperty("test-labels", "text-opacity"),
      ),
      0.35,
    );
    await p.getByLabel("Rail objective").selectOption("workers_connected");
    assert.match(await p.locator(".rail-summary").innerText(), /495,756/);
    await p.getByLabel("Rail competitiveness ratio").selectOption("3");
    await p.getByLabel("Rail cost").selectOption("high");
    await p.getByLabel("Rail overhead").selectOption("30");
    await p.getByLabel("Rail objective").selectOption("minutes_saved");
    await p.getByLabel("Rail cost").selectOption("low");
    await p.getByLabel("Rail overhead").selectOption("20");
    await p.locator(".rail-build-order summary").click();
    await p.locator(".rail-build-order button").first().focus();
    await p.keyboard.press("Enter");
    await p.locator(".rail-inspection").waitFor();
    await p.getByRole("button", { name: "Close rail inspection" }).click();
    await p.locator(".network-details summary").click();
    assert.match(
      await p.locator(".network-details").innerText(),
      /Existing stations benchmark/,
    );
    await p.getByRole("button", { name: "Collapse rail controls" }).click();
    await expand();
    await p
      .getByRole("checkbox", {
        name: "Sunshine Corridor (FDOT proposal)",
        exact: true,
      })
      .check();
    await p
      .getByRole("table", { name: "Sunshine and SOL/R comparison" })
      .waitFor();
    assert.equal(await p.locator(".compact-compare tbody tr").count(), 4);
    assert.match(await p.locator(".compact-compare").innerText(), /n\/a/);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(
      await p
        .locator(".network-panel")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
      true,
    );
    await p.getByRole("button", { name: "Collapse rail controls" }).click();
    await expand();
    await p
      .getByRole("checkbox", {
        name: "Sunshine Corridor (FDOT proposal)",
        exact: true,
      })
      .uncheck();
    await expand();
    await p
      .getByRole("checkbox", { name: "Proposed rail network", exact: true })
      .uncheck();
    await p.waitForFunction(
      () =>
        !window.deck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id.startsWith("rail-plan-")),
    );
    assert.equal(
      await p.evaluate(() =>
        window.map.getPaintProperty("test-labels", "text-opacity"),
      ),
      0.8,
    );
    assert.ok(
      !requests.some((u) => /\/rail_plan.json|\/rail_equity.json/.test(u)),
    );
    assert.deepEqual(errors, []);
    await p.close();
    console.log(
      `PASS connected rail ${name}: 39 links/10 built lines, stable growing budget, 18-link core only, schematic/geographic restoration, line focus, selectors/build order, compact comparison, 380px fit and new-file-only requests`,
    );
  }
  const p = await browser.newPage();
  await p.route("**/data/rail_network.json", async (r) => {
    const fs = await import("node:fs");
    const d = JSON.parse(fs.readFileSync("public/data/rail_network.json"));
    d.scenarios[0].lines[1].link_ids.push(d.scenarios[0].lines[0].link_ids[0]);
    await r.fulfill({ json: d });
  });
  await init(p);
  await p
    .getByRole("checkbox", { name: "Proposed rail network", exact: true })
    .check();
  await p.getByRole("alert").filter({ hasText: "exactly one line" }).waitFor();
  assert.equal((await ids(p)).length, 0);
  await p.close();
  console.log("PASS invalid line ownership: visible error, no wrong map");
} finally {
  await browser.close();
}
