import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const output=process.env.CANDIDATE_SCREENSHOT_DIR || '/tmp/sol-r-candidates';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const fixture={version:8,sources:{'test-label-source':{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#10171c'}},{id:'test-labels',type:'symbol',source:'test-label-source'}]};
const init=async page=>{
 await page.addInitScript(()=>{window.addEventListener('sol-r:deck-ready',e=>window.deck=e.detail);window.addEventListener('sol-r:map-ready',e=>window.map=e.detail);});
 await page.route('https://basemaps.cartocdn.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(fixture)}));
 await page.goto(process.env.SOL_R_TEST_URL || 'http://localhost:5173');
 await page.getByRole('status').filter({hasText:'BASEMAP LIVE'}).waitFor();
};
const expand=async page=>{const b=page.getByRole('button',{name:'Expand sidebar'});if(await b.isVisible()) await b.click();};
const collapse=async page=>{const b=page.getByRole('button',{name:'Collapse sidebar'});if(await b.isVisible()) await b.click();};
const layers=page=>page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).filter(l=>l.id.startsWith('candidate-')).map(l=>({id:l.id,count:l.props.data.length,before:l.props.beforeId,width:l.props.getWidth})));
try {
 for(const [name,width,height] of [['laptop',1440,900],['phone',390,844]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await init(page);await expand(page);
  const toggle=page.getByRole('checkbox',{name:'Candidate connections',exact:true});assert.equal(await toggle.isChecked(),false);assert.deepEqual(await layers(page),[]);
  const shot=async(mode,pitch)=>{
   await collapse(page);await page.evaluate(({pitch,width})=>window.map.jumpTo({center:[-81.45,28.50],zoom:width<600?8.7:9.6,pitch,bearing:0,padding:{top:0,bottom:0,left:0,right:0}}),{pitch,width});
   await page.waitForTimeout(600);if(!process.env.SOL_R_REUSE_SCREENSHOTS) await page.screenshot({path:`${output}/${name}-${mode}-${pitch?'3d':'2d'}.png`});
  };
  await shot('off',0);await shot('off',45);
  await expand(page);await toggle.focus();await page.keyboard.press('Space');
  await page.getByLabel('Inspect candidate center',{exact:true}).waitFor();
  assert.match(await page.locator('.candidate-details').innerText(),/146 centers · 270 connections/);
  assert.match(await page.locator('.candidate-details').innerText(),/2 groups of 5 centers/);
  const ready=await layers(page);assert.deepEqual(ready.map(l=>l.count),[270,146]);assert.ok(ready.every(l=>l.before==='test-labels'));assert.equal(ready[0].width,1);
  await page.getByText('Assumptions and sources',{exact:true}).click();
  assert.match(await page.locator('.candidate-details').innerText(),/84,289/);assert.match(await page.locator('.candidate-details').innerText(),/4,252/);
  await page.getByText('Assumptions and sources',{exact:true}).click();
  const select=page.getByLabel('Inspect candidate center',{exact:true});await select.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.locator('.candidate-inspector').waitFor();assert.match(await page.locator('.candidate-inspector').innerText(),/204,031/);assert.match(await page.locator('.candidate-inspector').innerText(),/Population \(modeled estimate\)/);
  assert.match(await page.locator('.candidate-inspector').innerText(),/Illustrative candidate. Not a route or a proposal./);
  await page.getByRole('button',{name:'Close candidate inspection'}).click();
  await shot('alone',0);await shot('alone',45);
  // Real rendered center picking: zoom to the largest center, move pointer and click.
  await page.evaluate(()=>{const c=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='candidate-centers').props.data[0];window.map.jumpTo({center:c.geometry.coordinates,zoom:11,pitch:0,padding:{top:0,bottom:0,left:0,right:0}});});
  await page.waitForTimeout(500);
  const point=await page.evaluate(()=>{const layer=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='candidate-centers');const p=window.map.project(layer.props.data[0].geometry.coordinates);return {x:p.x,y:p.y};});
  await page.mouse.move(point.x,point.y);
  await page.waitForFunction(()=>{const l=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='candidate-centers');return l.props.getLineColor(l.props.data[0])[0]===250;});
  assert.ok(await page.evaluate(()=>{const l=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='candidate-centers');return l.props.getLineColor(l.props.data[0])[0]===250;}),'hover highlight');
  await page.mouse.click(point.x,point.y);await page.locator('.candidate-inspector').waitFor();assert.match(await page.locator('.candidate-inspector').innerText(),/204,031/);
  await page.getByRole('button',{name:'Close candidate inspection'}).click();
  // Find an actual rendered arc fragment through deck picking, then click it.
  await collapse(page);await page.evaluate(()=>{const e=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id==='candidate-connections').props.data[0];const [a,b]=e.geometry.coordinates;window.map.jumpTo({center:[(a[0]+b[0])/2,(a[1]+b[1])/2],zoom:11,pitch:0});});await page.waitForTimeout(500);
  const arc=await page.evaluate(()=>{const deck=window.deck._deck;const p=deck.pickObject({x:innerWidth/2,y:innerHeight/2,radius:Math.min(innerWidth/2-50,250),layerIds:['candidate-connections']});if(!p?.object||!p.devicePixel)return null;return {x:(p.devicePixel[0]+0.5)/p.pixelRatio,y:innerHeight-(p.devicePixel[1]+0.5)/p.pixelRatio,id:p.object.properties.from_id};});assert.ok(arc,'arc has pickable rendered pixels');
  await page.mouse.move(arc.x,arc.y);await page.mouse.click(arc.x,arc.y);await page.getByRole('heading',{name:'Candidate connection',exact:true}).waitFor();assert.match(await page.locator('.candidate-inspector').innerText(),/straight-line km/);
  const edgeSelect=page.getByLabel('Inspect candidate connection',{exact:true});await edgeSelect.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.notEqual(await edgeSelect.inputValue(),'');
  await page.getByRole('button',{name:'Close candidate inspection'}).click();
  await page.getByRole('checkbox',{name:'Population',exact:true}).check();await page.getByRole('button',{name:'Inspect hexagon',exact:true}).waitFor();await expand(page);
  await page.getByRole('checkbox',{name:'Employment',exact:true}).check();await page.getByRole('button',{name:'Inspect employment block',exact:true}).waitFor();
  await page.waitForFunction(()=>window.deck._deck.props.layers.flat(Infinity).some(l=>l.id==='employment-block-needles'));
  assert.ok(await page.evaluate(()=>{const ls=window.deck._deck.props.layers.flat(Infinity);return ls.some(l=>l.id.startsWith('population-hexagon'))&&ls.some(l=>l.id==='candidate-centers');}));
  await shot('combined',45);
  if (await page.locator('[data-panel="population"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="population"] > h2 button').click();
    await page.getByRole('button',{name:'Toggle population 3D view'}).click();if (await page.locator('[data-panel="employment"] > h2 button').getAttribute('aria-expanded') === 'false') await page.locator('[data-panel="employment"] > h2 button').click();
    await page.getByRole('button',{name:'Toggle employment 3D view'}).click();await shot('combined',0);
  const underlying=await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).filter(l=>!l.id.startsWith('candidate-')&&!l.id.startsWith('flow-')).map(l=>l.id));
  await expand(page);await toggle.uncheck();await page.waitForTimeout(150);assert.deepEqual(await layers(page),[]);assert.deepEqual(await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).map(l=>l.id)),underlying);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
  console.log(`PASS candidates ${name}: keyboard/pointer center and arc inspection, hover, graph note, off cleanup, label ordering, 2D/3D coexistence, reduced motion and layout`);
 }
 const page=await browser.newPage();await init(page);
 for(const file of ['candidate_centers.geojson','candidate_connections.geojson','candidate_connections_summary.json']) {
  await page.route(`**/data/${file}`,r=>r.fulfill({status:404,body:'missing'}));
  await page.getByRole('checkbox',{name:'Candidate connections',exact:true}).check();await page.getByRole('alert').filter({hasText:'Candidate connections unavailable'}).waitFor();assert.deepEqual(await layers(page),[]);
  await page.unroute(`**/data/${file}`);await page.getByRole('button',{name:'Retry candidate data'}).click();await page.getByLabel('Inspect candidate center',{exact:true}).waitFor();await page.getByRole('checkbox',{name:'Candidate connections',exact:true}).uncheck();
 }
 await page.route('**/data/candidate_connections_summary.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));await page.getByRole('checkbox',{name:'Candidate connections',exact:true}).check();await page.getByRole('alert').filter({hasText:'malformed'}).waitFor();assert.deepEqual(await layers(page),[]);await page.close();
 console.log('PASS candidates missing files, malformed summary, atomic loading and retry');
} finally {await browser.close();}
