import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const init = async (p) => {
  await p.addInitScript(() => {
    window.addEventListener("sol-r:map-ready", (e) => (window.map = e.detail));
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
};
try {
  for (const [name, width, height] of [
    ["laptop", 1440, 1080],
    ["phone", 380, 844],
  ]) {
    const p = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [],
      requests = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (r.url().includes("sunshine_corridor.geojson")) requests.push(r.url());
    });
    await init(p);
    const expand = async () => {
      const b = p.getByRole("button", { name: "Expand sidebar" });
      if (await b.isVisible()) await b.click();
    };
    const panel = async () => {
      const b = p.getByRole("button", { name: "Expand rail controls" });
      if (await b.isVisible()) await b.click();
    };
    await expand();
    const toggle = p.getByRole("checkbox", {
      name: "Sunshine Corridor (FDOT proposal)",
      exact: true,
    });
    assert.equal(await toggle.isChecked(), false);
    await toggle.check();
    const table = p.getByRole("table", {
      name: "Sunshine and SOL/R comparison",
    });
    await table.waitFor();
    assert.equal(await table.locator("tbody tr").count(), 4);
    assert.match(await table.innerText(), /3.543–4.787/);
    assert.match(await table.innerText(), /5,968,066.1/);
    assert.match(await table.innerText(), /n\/a/);
    await expand();
    await p
      .getByRole("checkbox", { name: "Existing transit", exact: true })
      .check();
    await p.getByLabel("Inspect transit", { exact: true }).waitFor();
    await panel();
    await p.locator(".network-details summary").click();
    await p
      .getByLabel("Inspect Sunshine Corridor", { exact: true })
      .selectOption("sunshine_3b");
    const popup = p.getByRole("complementary", {
      name: "Sunshine Corridor details",
    });
    await popup.waitFor();
    assert.match(await popup.innerText(), /1,750–2,400M/);
    await p
      .getByRole("button", { name: "Close Sunshine Corridor details" })
      .click();
    await p
      .getByLabel("Inspect Sunshine Corridor", { exact: true })
      .selectOption("sunshine_mco");
    assert.match(await popup.innerText(), /Not supplied for this station/);
    await p
      .getByRole("button", { name: "Close Sunshine Corridor details" })
      .click();
    const styles = await p.evaluate(() => {
      const ls = window.deck._deck.props.layers.flat(Infinity),
        a = ls.find((l) => l.id === "transit-core"),
        b = ls.find((l) => l.id === "sunshine-core");
      return {
        same: a.constructor === b.constructor,
        a: a.props.getLineWidth(a.props.data.features[0]),
        b: b.props.getLineWidth(b.props.data.features[0]),
        color: b.props.getLineColor(b.props.data.features[0]),
      };
    });
    assert.equal(styles.same, true);
    assert.equal(styles.a, styles.b);
    assert.deepEqual(styles.color, [255, 107, 107, 175]);
    await p.getByLabel("Rail objective").selectOption("workers_connected");
    assert.ok(
      !(await table.innerText().then((s) => s.includes("5,968,066.1"))),
    );
    await p.getByRole("button", { name: "$5B", exact: true }).click();
    await p.getByRole("button", { name: "Collapse rail controls" }).click();
    const collapse = p.getByRole("button", { name: "Collapse sidebar" });
    if (await collapse.isVisible()) await collapse.click();
    await p.evaluate(() =>
      window.map.jumpTo({
        center: [-81.415, 28.405],
        zoom: 11,
        pitch: 0,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      }),
    );
    await p.waitForTimeout(400);
    const point = await p.evaluate(() => {
      const q = window.map.project([-81.467626, 28.420432]);
      return { x: q.x, y: q.y };
    });
    await p.mouse.click(point.x, point.y);
    await popup.waitFor();
    await p
      .getByRole("button", { name: "Close Sunshine Corridor details" })
      .click();
    await p.evaluate(() => window.map.jumpTo({ zoom: 9, pitch: 45 }));
    await p.waitForFunction(
      () =>
        window.deck._deck.props.layers
          .flat(Infinity)
          .find((l) => l.id === "sunshine-station-labels").props.data.length ===
        0,
    );
    await p.evaluate(() => window.map.jumpTo({ zoom: 11 }));
    await p.waitForFunction(
      () =>
        window.deck._deck.props.layers
          .flat(Infinity)
          .find((l) => l.id === "sunshine-station-labels").props.data.length ===
        3,
    );
    await expand();
    await toggle.uncheck();
    await p.waitForFunction(
      () =>
        !window.deck._deck.props.layers
          .flat(Infinity)
          .some((l) => l.id.startsWith("sunshine-")),
    );
    await expand();
    await toggle.check();
    await table.waitFor();
    assert.equal(requests.length, 1);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    await p.close();
    console.log(
      `PASS Sunshine ${name}: unchanged shared geometry/style/color, compact 4-row comparison, new-network objective/budget, source details, keyboard/map inspection, zoom/pitch, cached loading and 380px fit`,
    );
  }
  const p = await browser.newPage();
  await p.route("**/data/sunshine_corridor.geojson", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await init(p);
  await p
    .getByRole("checkbox", {
      name: "Sunshine Corridor (FDOT proposal)",
      exact: true,
    })
    .check();
  await p
    .getByRole("alert")
    .filter({ hasText: "Sunshine Corridor file unavailable" })
    .waitFor();
  await p.unroute("**/data/sunshine_corridor.geojson");
  await p.getByRole("button", { name: "Retry Sunshine Corridor" }).click();
  await p.getByRole("table").waitFor();
  await p.close();
  console.log("PASS Sunshine missing file and retry");
} finally {
  await browser.close();
}
