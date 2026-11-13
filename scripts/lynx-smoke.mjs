import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  for(const [name,width,height] of [['phone',390,844],['laptop',1440,900]]) {
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error' && /deck|WebGL/.test(m.text())) errors.push(m.text());});
    await page.addInitScript(()=>{
      window.addEventListener('sol-r:map-ready',e=>window.map=e.detail);
      window.addEventListener('sol-r:deck-ready',e=>window.deck=e.detail);
    });
    await page.route('https://basemaps.cartocdn.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:8,
      sources:{labels:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},
      layers:[{id:'background',type:'background',paint:{'background-color':'#10171c'}},{id:'test-labels',type:'symbol',source:'labels'}]})}));
    await page.goto('http://localhost:5173');
    await page.getByRole('status').filter({hasText:'BASEMAP LIVE'}).waitFor();
    const expand=async()=>{const b=page.getByRole('button',{name:'Expand sidebar'});if(await b.isVisible())await b.click();};
    const collapse=async()=>{const b=page.getByRole('button',{name:'Collapse sidebar'});if(await b.isVisible())await b.click();};
    await expand();
    assert.ok((await page.getByRole('region', {name:'Data layers',exact:true}).locator('.section-heading').innerText()).includes('06 LIVE / 00 PLANNED'));
    await page.getByRole('checkbox',{name:'Bus baseline (LYNX)',exact:true}).check();
    await page.getByLabel('Inspect bus stop',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.map.getPitch()),0);
    assert.equal(await page.getByLabel('Bus frequent threshold').inputValue(),'30');
    assert.equal(await page.getByLabel('Include LYMMO',{exact:true}).isChecked(),false);
    assert.equal(await page.getByLabel('Show infrequent stops',{exact:true}).isChecked(),false);
    await collapse();
    const styling=await page.evaluate(()=>{
      const layers=window.deck._deck.props.layers.flat(Infinity);
      const core=layers.find(l=>l.id==='lynx-stops'), glow=layers.find(l=>l.id==='lynx-glow');
      return {blend:core.props.parameters.blendColorDstFactor, glowBlend:glow.props.parameters.blendColorDstFactor,
        maxRadius:Math.max(...core.props.data.map(f=>core.props.getRadius(f)*core.props.radiusScale)),
        maxGlowAlpha:Math.max(...glow.props.data.map(f=>glow.props.getFillColor(f)[3])),
        opacity:core.props.opacity};
    });
    assert.equal(styling.blend,'one-minus-src-alpha');
    assert.equal(styling.glowBlend,'one-minus-src-alpha');
    assert.ok(styling.maxRadius<3);
    assert.ok(styling.maxGlowAlpha<32);
    assert.equal(styling.opacity,.65);
    const source=await page.evaluate(async()=> (await (await fetch('/data/lynx_stops.geojson')).json()).features);
    for(const include of [false,true]) {
      await page.getByLabel('Include LYMMO',{exact:true}).setChecked(include);
      for(const threshold of [15,20,30]) {
        await page.getByLabel('Bus frequent threshold').selectOption(String(threshold));
        const key=include?'headway_best_route_min':'headway_best_nonlymmo_min';
        const expected=source.filter(f=>f.properties[key]!==null && f.properties[key]<=threshold).length;
        await page.waitForFunction(n=>window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='lynx-stops')?.props.data.length===n,expected);
        const legend=await page.getByLabel('Bus tier counts').innerText();
        assert.ok(legend.includes('Served, >'+threshold+' min: 0'));
      }
    }
    await page.getByLabel('Include LYMMO',{exact:true}).uncheck();
    await page.getByLabel('Show infrequent stops',{exact:true}).check();
    const served=source.filter(f=>f.properties.headway_best_nonlymmo_min!==null).length;
    await page.waitForFunction(n=>window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='lynx-stops')?.props.data.length===n,served);
    await page.getByLabel('Show infrequent stops',{exact:true}).uncheck();
    await page.getByLabel('Bus opacity').fill('0.45');
    await page.waitForFunction(()=>window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='lynx-stops')?.props.opacity===.45);
    const target=source.find(f=>f.properties.freq15_nl);
    await page.getByLabel('Inspect bus stop',{exact:true}).selectOption(target.properties.stop_id);
    const detail=await page.getByLabel('Bus stop details',{exact:true}).innerText();
    for(const value of [target.properties.stop_name,target.properties.county,target.properties.route_short_name,'Scheduled service from the GTFS feed, not observed reliability','15 min, 20 min, 30 min']) assert.ok(detail.includes(value));
    await page.getByRole('button',{name:'Close bus stop details'}).click();
    // GPU picking on real geometry, then exercise the same handlers as pointer interactions.
    const picked=await page.evaluate(async f=>{
      window.map.jumpTo({center:f.geometry.coordinates,zoom:15,pitch:45});
      await new Promise(r=>setTimeout(r,500));
      const p=window.map.project(f.geometry.coordinates);
      const info=window.deck.pickObject({x:p.x,y:p.y,radius:6,layerIds:['lynx-stops']});
      if(info?.object) {info.layer.props.onHover(info);info.layer.props.onClick(info);}
      return info?.object?.properties.stop_id;
    },target);
    assert.ok(picked);
    const radiusAt15=await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='lynx-stops').props.radiusScale);
    await page.evaluate(()=>window.map.jumpTo({zoom:8}));
    await page.waitForFunction(high=>window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='lynx-stops').props.radiusScale<high,radiusAt15);
    await page.evaluate(()=>window.map.jumpTo({zoom:15}));
    await page.getByLabel('Bus stop details',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Close bus stop details'}).click();
    await expand();
    const pitch=await page.evaluate(()=>window.map.getPitch());
    await page.getByRole('checkbox',{name:'Bus baseline (LYNX)',exact:true}).uncheck();
    assert.equal(await page.evaluate(()=>window.map.getPitch()),pitch);
    assert.equal(await page.locator('.bus-panel').count(),0);
    await page.getByRole('checkbox',{name:'Bus baseline (LYNX)',exact:true}).check();
    assert.equal(await page.evaluate(()=>window.map.getPitch()),pitch);
    // Demand + equity + rail coexist and maintain their intended ordering.
    await page.getByRole('checkbox',{name:'Employment',exact:true}).check();
    await page.getByRole('button',{name:'Inspect employment block',exact:true}).waitFor();
    await expand();await page.getByRole('checkbox',{name:'Equity',exact:true}).check();
    await expand();await page.getByRole('checkbox',{name:'Existing transit',exact:true}).check();
    await page.getByLabel('Inspect transit',{exact:true}).waitFor();
    await collapse();
    const order=await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).map(l=>({id:l.id,before:l.props.beforeId})));
    const bus=order.findIndex(l=>l.id==='lynx-stops');
    assert.ok(order.findIndex(l=>l.id==='employment-block-needles')<bus);
    assert.ok(order.findIndex(l=>l.id==='equity-tracts')<bus);
    assert.ok(order.findIndex(l=>l.id==='transit-core')>bus);
    assert.equal(order.at(-1).id,'transit-station-labels');
    for(const l of order)assert.equal(l.before,'test-labels');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('[data-panel="bus"] > h2 button').click();
    await page.getByLabel('Bus frequent threshold').selectOption('30');
    const cards = await page.evaluate(() => [".equity-panel", ".employment-panel", ".bus-panel", ".transit-panel:not(.bus-panel)"].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    }));
    for(let i=0;i<cards.length;i++) for(let j=i+1;j<cards.length;j++) {
      const a=cards[i],b=cards[j];
      assert.ok(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top, "Layer cards must not overlap");
    }
    if(!existsSync(`/tmp/sol-r-lynx-${name}.png`)) await page.screenshot({path:`/tmp/sol-r-lynx-${name}.png`});
    assert.deepEqual(errors,[]);
    // Fresh page: a failed data request is visible, retry restores actual data.
    await page.route('**/data/lynx_stops.geojson',r=>r.abort());
    await page.reload();await page.getByRole('status').filter({hasText:'BASEMAP LIVE'}).waitFor();
    await expand();await page.getByRole('checkbox',{name:'Bus baseline (LYNX)',exact:true}).check();
    await page.getByRole('alert').filter({hasText:'Bus data unavailable'}).waitFor();
    await page.unroute('**/data/lynx_stops.geojson');await page.getByRole('button',{name:'Retry bus'}).click();
    await page.getByLabel('Inspect bus stop',{exact:true}).waitFor();
    console.log(`PASS LYNX ${name}: filters, LYMMO, counts, inspection, picking, opacity, independent 2D/3D, ordering, failure/retry and layout`);
    await page.close();
  }
} finally {await browser.close();}
