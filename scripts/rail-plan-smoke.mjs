import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const fixture = {
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
mkdirSync("work/rail-plan", { recursive: true });
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
try {
  for (const [name, width, height] of [
    ["laptop", 1440, 900],
    ["phone", 390, 844],
  ]) {
    const p = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [],
      requests = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (/rail_(plan|equity).json/.test(r.url())) requests.push(r.url());
    });
    await init(p);
    const expand = async () => {
      const b = p.getByRole("button", { name: "Expand sidebar" });
      if (await b.isVisible()) await b.click();
    };
    await expand();
    const toggle = p.getByRole("checkbox", {
      name: "Proposed rail network",
      exact: true,
    });
    assert.equal(await toggle.isChecked(), false);
    await toggle.focus();
    await p.keyboard.press("Space");
    await p.locator(".rail-summary").waitFor();
    assert.match(await p.locator(".rail-summary").innerText(), /47 links/);
    assert.match(await p.locator(".rail-summary").innerText(), /4,149,627.6/);
    assert.match(await p.locator(".rail-summary").innerText(), /15.4 minutes/);
    await p.getByText("Who does this serve?", { exact: true }).click();
    assert.match(await p.locator(".rail-equity").innerText(), /Within 2 km/);
    assert.match(await p.locator(".rail-equity").innerText(), /4.1%/);
    assert.match(await p.locator(".rail-equity").innerText(), /78,676/);
    await p.getByLabel("Rail budget", { exact: true }).focus();
    await p.keyboard.press("Home");
    await p.waitForFunction(
      () =>
        window.deck._deck.props.layers
          .flat(Infinity)
          .find((l) => l.id === "rail-plan-links")?.props.data.length === 0,
    );
    await p.getByRole("button", { name: "$10B", exact: true }).click();
    await p.getByLabel("Highlight core network", { exact: true }).check();
    await p.getByLabel("Rail color by", { exact: true }).selectOption("type");
    assert.match(
      await p.getByLabel("Rail legend").innerText(),
      /Passenger corridor/,
    );
    await p
      .getByLabel("Rail objective", { exact: true })
      .selectOption("workers_connected");
    await p
      .getByLabel("Rail competitiveness ratio", { exact: true })
      .selectOption("3");
    await p.getByLabel("Rail cost", { exact: true }).selectOption("high");
    await p.getByLabel("Rail overhead", { exact: true }).selectOption("30");
    assert.match(
      await p.locator(".rail-summary").innerText(),
      /of 495,832 workers/,
    );
    assert.doesNotMatch(
      await p.locator(".rail-summary").innerText(),
      /job-minutes/,
    );
    await p
      .getByLabel("Rail objective", { exact: true })
      .selectOption("minutes_saved");
    await p.getByLabel("Rail cost", { exact: true }).selectOption("low");
    await p.getByLabel("Rail overhead", { exact: true }).selectOption("20");
    await p.getByLabel("Rail color by", { exact: true }).selectOption("phase");
    await p.getByLabel("Highlight core network", { exact: true }).uncheck();
    await p.locator(".rail-build-order summary").click();
    const first = p.locator(".rail-build-order button").first();
    await first.focus();
    await p.keyboard.press("Enter");
    await p.locator(".rail-plan-controls .rail-inspection").waitFor();
    assert.match(
      await p.locator(".rail-plan-controls .rail-inspection").innerText(),
      /Downtown Orlando/,
    );
    assert.match(
      await p.locator(".rail-plan-controls .rail-inspection").innerText(),
      /added in step 1/,
    );
    await p.getByRole("button", { name: "Close rail inspection" }).click();
    await p
      .getByLabel("Inspect rail station", { exact: true })
      .selectOption({ index: 1 });
    assert.match(
      await p.locator(".rail-plan-controls .rail-inspection").innerText(),
      /km/,
    );
    await p
      .getByRole("checkbox", { name: "Candidate connections", exact: true })
      .check();
    await p.getByLabel("Inspect candidate center", { exact: true }).waitFor();
    await p.getByRole("button", { name: "Collapse sidebar" }).click();
    await p.evaluate(() =>
      window.map.jumpTo({
        center: [-81.43, 28.48],
        zoom: 9.5,
        pitch: 0,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      }),
    );
    await p.waitForTimeout(600);
    await p.screenshot({ path: `work/rail-plan/${name}-2d.png` });
    await p.evaluate(() => window.map.jumpTo({ pitch: 45 }));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `work/rail-plan/${name}-3d.png` });
    const point = await p.evaluate(() => {
      const stations = window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "rail-plan-stations").props.data;
      for (const c of stations) {
        const q = window.map.project([c.lon, c.lat]);
        if (
          q.x > 120 &&
          q.x < innerWidth - 60 &&
          q.y > 150 &&
          q.y < innerHeight - 150
        )
          return { x: q.x, y: q.y };
      }
    });
    assert.ok(point);
    await p.mouse.move(point.x, point.y);
    await p.locator(".rail-hover").waitFor();
    await p.mouse.click(point.x, point.y);
    await p.locator(".rail-plan-controls .rail-inspection").waitFor();
    await expand();
    await p.getByRole("checkbox", { name: "Population", exact: true }).check();
    await p
      .getByRole("button", { name: "Inspect hexagon", exact: true })
      .waitFor();
    await expand();
    await p.getByRole("checkbox", { name: "Employment", exact: true }).check();
    await p
      .getByRole("button", { name: "Inspect employment block", exact: true })
      .waitFor();
    await p.waitForFunction(() => {
      const ls = window.deck._deck.props.layers.flat(Infinity);
      return (
        [
          "rail-plan-links",
          "candidate-centers",
          "employment-block-needles",
        ].every((id) => ls.some((l) => l.id === id)) &&
        ls.some((l) => l.id.startsWith("population-hexagon"))
      );
    });
    await expand();
    await toggle.uncheck();
    await p.waitForFunction(
      () =>
        !window.deck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id.startsWith("rail-plan-")),
    );
    await toggle.check();
    await p.locator(".rail-summary").waitFor();
    assert.equal(requests.length, 2);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    await p.close();
    console.log(
      `PASS rail plan ${name}: default totals, keyboard toggle/budget/build step, selectors, core, legend, equity radii, inspection, candidate coexistence, 2D/3D, load once, cleanup and fit`,
    );
  }
  const p = await browser.newPage();
  await p.route("**/data/rail_plan.json", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await init(p);
  await p
    .getByRole("checkbox", { name: "Proposed rail network", exact: true })
    .check();
  await p
    .getByRole("alert")
    .filter({ hasText: "Rail plan unavailable" })
    .waitFor();
  await p.unroute("**/data/rail_plan.json");
  await p.getByRole("button", { name: "Retry rail plan" }).click();
  await p.locator(".rail-summary").waitFor();
  await p.close();
  console.log("PASS rail plan missing file and retry");
} finally {
  await browser.close();
}
