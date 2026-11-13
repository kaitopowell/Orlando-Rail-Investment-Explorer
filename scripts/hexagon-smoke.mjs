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
              id: "place_city",
              type: "symbol",
              source: "labels",
              layout: { "text-field": "City" },
            },
            {
              id: "road_label",
              type: "symbol",
              source: "labels",
              layout: { "text-field": "Street" },
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
        .some((l) => l.id === "population-hexagon-pillars" && l.props.extruded),
    );
    const loaded = Date.now() - start;
    assert.equal(
      await page.getByLabel("Population source", { exact: true }).inputValue(),
      "hexagons",
    );
    const info = await page.evaluate(() => {
      const l = window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "population-hexagon-pillars");
      const f = l.props.data.find((f) => f.properties.population > 1000);
      return {
        count: l.props.data.length,
        p: f.properties,
        center: f.geometry.coordinates[0]
          .slice(0, 6)
          .reduce((a, p) => [a[0] + p[0] / 6, a[1] + p[1] / 6], [0, 0]),
      };
    });
    assert.equal(info.count, 7896);
    assert.equal(
      await page.getByLabel("Hexagon height scale").inputValue(),
      "sqrt",
    );
    assert.equal(
      await page
        .getByLabel("Vertical exaggeration", { exact: true })
        .inputValue(),
      "1",
    );
    assert.equal(await page.getByLabel("Column width").inputValue(), "0.35");
    assert.match(
      await page.locator(".population-legend").innerText(),
      /Widths are not to scale/,
    );
    const order = await page.evaluate(() => {
      // getStyle() omits custom layers; this is MapLibre's actual render stack.
      const layers = window.map.style._order;
      const pillar = window.deck._deck.props.layers
        .flat(Infinity)
        .find((l) => l.id === "population-hexagon-pillars");
      return {
        before: pillar.props.beforeId,
        index: layers.findIndex(
          (id) => id === "deck-layer-group-before:place_city",
        ),
        labels: layers.indexOf("place_city"),
        streets: layers.indexOf("road_label"),
        visible:
          window.map.getLayoutProperty("road_label", "visibility") ?? "visible",
        coverage: pillar.props.coverage,
        radius: pillar.props.radius * pillar.props.coverage,
        units: pillar.props.radiusUnits,
        blend: pillar.props.parameters.blendColorDstFactor,
        material: pillar.props.material,
        shader: pillar.getShaders().inject["fs:DECKGL_FILTER_COLOR"],
      };
    });
    assert.equal(order.before, "place_city");
    assert.ok(order.index >= 0 && order.index < order.labels);
    assert.ok(order.index < order.streets);
    assert.equal(order.visible, "visible");
    assert.equal(order.coverage, 0.35);
    assert.ok(Math.abs(order.radius-.8)<1e-10);
    assert.equal(order.units, "pixels");
    assert.equal(order.blend, "one-minus-src-alpha");
    assert.equal(order.material, false);
    assert.match(order.shader, /needleFraction/);
    const emphasisSnapshot=async value=>{
      await page.getByLabel('Population display emphasis',{exact:true}).fill(value);
      await page.waitForTimeout(150);
      return page.evaluate(()=>{
        const ls=window.deck._deck.props.layers.flat(Infinity), core=ls.find(l=>l.id==='population-hexagon-pillars'), glow=ls.find(l=>l.id==='population-hexagon-needle-glow');
        const f=core.props.data.find(f=>f.properties.population>=400 && f.properties.population<500);
        return {id:f.properties.h3, value:f.properties.population, height:core.props.getElevation(f), color:core.props.getFillColor(f),
          count:core.props.data.length, glowCount:glow.props.data.length, glowPickable:glow.props.pickable, glowBlend:glow.props.parameters.blendColorDstFactor};
      });
    };
    const gentle=await emphasisSnapshot('0'), strong=await emphasisSnapshot('100');
    assert.equal(gentle.id,strong.id);assert.equal(gentle.value,strong.value);assert.equal(strong.count,7896);
    assert.ok(strong.height<gentle.height);assert.ok(strong.color[3]<gentle.color[3]);
    assert.ok(strong.glowCount<=800);assert.equal(strong.glowPickable,false);assert.equal(strong.glowBlend,'one-minus-src-alpha');
    assert.match(await page.getByLabel('Population display method').innerText(),/does not change the data/);
    await page.getByLabel('Inspect H3 ID').fill(strong.id);await page.getByRole('button',{name:'Inspect hexagon',exact:true}).click();
    assert.ok((await page.getByLabel('Hexagon details',{exact:true}).innerText()).includes(String(strong.value)));
    await page.getByRole('button',{name:'Close hexagon details'}).click();
    await page.getByLabel('Population display emphasis',{exact:true}).fill('50');
    const screenshot = `work/kontur-pillars-${name}.png`;
    if (!process.env.SOL_R_REUSE_SCREENSHOTS || !existsSync(screenshot))
      await page.screenshot({ path: screenshot });

    await page.getByLabel("Column width").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByLabel("Column width").inputValue(), "0.4");
    await page.waitForFunction(()=>window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='population-hexagon-pillars').props.coverage===.4);
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
    assert.equal(await page.getByLabel("Column width").count(), 0);
    const circles=await page.evaluate(()=>{
      const l=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='population-hexagons');
      const f=l.props.data.find(f=>f.properties.population>1000);
      l.props.onHover({object:f});l.props.onClick({object:f});
      return {count:l.props.data.length, h3:f.properties.h3, before:l.props.beforeId, radius:l.props.getRadius(f), alpha:l.props.getFillColor(f)[3]};
    });
    assert.equal(circles.count,7896);assert.equal(circles.before,'place_city');assert.ok(circles.radius>0);assert.ok(circles.alpha>=13 && circles.alpha<=89);
    assert.match(await page.getByLabel('Hexagon details',{exact:true}).innerText(),new RegExp(circles.h3));
    await page.getByRole('button',{name:'Close hexagon details'}).click();
    assert.match(
      await page.locator(".population-legend").innerText(),
      /stretched display value/,
    );
    if (await page.locator('[data-panel="population"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="population"] > h2 button').click();
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
        .find((l) => l.id === "population-hexagon-pillars");
      const f = layer.props.data.find((f) => f.properties.h3 === p.h3);
      const [x, y] = window.deck._deck
        .getViewports()[0]
        .project([...center, layer.props.getElevation(f) * .2]);
      return { x, y };
    }, info);
    assert.equal(
      await page.evaluate(
        (point) =>
          window.deck.pickObject({
            ...point,
            radius: 4,
            layerIds: ["population-hexagon-pillars"],
          })?.object?.properties.h3,
        point,
      ),
      info.p.h3,
    );
    await page.getByRole("button", { name: "Orlando", exact: true }).click();
    if (await page.locator('[data-panel="population"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="population"] > h2 button').click();
    await page
      .getByRole("button", { name: "Toggle population 3D view" })
      .click();
    await page.waitForTimeout(400);
    if (width < 600) {
      const hex = await page.locator(".right-panels").boundingBox();
      const transit = await page.locator(".view-controls").boundingBox();
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
    // Both demand sources remain enabled and inspectable in both modes.
    await expand();
    await page.getByRole('checkbox',{name:'Employment',exact:true}).check();
    await page.getByRole('button',{name:'Inspect employment block',exact:true}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:'Population',exact:true,includeHidden:true}).isChecked(),true);
    for(const pitch of [0,45]) {
      await page.evaluate(p=>window.map.jumpTo({pitch:p}),pitch);
      await page.waitForFunction(is3D=>{
        const ids=window.deck._deck.props.layers.flat(Infinity).map(l=>l.id);
        return ids.includes(is3D?'population-hexagon-pillars':'population-hexagons') && ids.includes(is3D?'employment-block-needles':'employment-circles');
      },pitch>0);
      assert.ok(await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).every(l=>l.props.beforeId==='place_city')));
    }
    const stack=await page.locator('.right-panels').boundingBox();
    assert.ok(stack.x>=0 && stack.x+stack.width<=width && stack.y>=0 && stack.y+stack.height<=height);
    await page.getByLabel('Employment opacity').scrollIntoViewIfNeeded();
    await page.getByLabel('Employment opacity').fill('0.5');
    await page.locator('[data-panel="population"] > h2 button').click();
    await page.getByLabel('Column width').scrollIntoViewIfNeeded();
    await page.getByLabel('Column width').fill('0.5');
    assert.deepEqual(errors, []);
    console.log(
      `PASS Kontur ${name}: loaded ${loaded}ms; count, source switch, scales, inspector, picking, modes and transit order`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
