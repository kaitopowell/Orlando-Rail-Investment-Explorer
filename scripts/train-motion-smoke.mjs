import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
const output=process.env.TRAIN_SCREENSHOT_DIR || "/tmp/sol-r-train-motion";
mkdirSync(output,{recursive:true});
try {
 for(const [name,width,height] of [["laptop",1440,900],["phone",390,844]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:"reduce"});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error" && /deck|WebGL/.test(m.text())) errors.push(m.text());});
  await page.addInitScript(()=>{
   window.addEventListener("sol-r:deck-ready",e=>window.deck=e.detail);
   window.addEventListener("sol-r:map-ready",e=>window.map=e.detail);
  });
  await page.route("https://basemaps.cartocdn.com/**",r=>r.fulfill({contentType:"application/json",body:JSON.stringify({version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#10171c"}}]})}));
  await page.goto("http://localhost:5173");
  await page.getByRole("status").filter({hasText:"BASEMAP LIVE"}).waitFor();
  const expand=async()=>{const b=page.getByRole("button",{name:"Expand sidebar"});if(await b.isVisible()) await b.click();};
  const layerState=()=>page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).filter(l=>l.id.startsWith("transit-trains-")).map(l=>({id:l.id,time:l.props.currentTime,before:l.props.beforeId,pickable:l.props.pickable,count:l.props.data.length})));
  await expand();
  await page.getByRole("checkbox",{name:"Existing transit",exact:true}).check();
  await page.getByLabel("Inspect transit",{exact:true}).waitFor();
  await expand();
  const toggle=page.getByRole("checkbox",{name:"Illustrative train motion",exact:true});
  assert.equal(await toggle.isChecked(),false);
  assert.deepEqual(await layerState(),[]);
  const underlying=await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).filter(l=>l.id.startsWith("transit-")).map(l=>({id:l.id,data:JSON.stringify(l.props.data)})));
  // Explicit keyboard opt-in remains possible with reduced motion requested.
  await toggle.focus();await page.keyboard.press("Space");
  await page.waitForFunction(()=>window.deck._deck.props.layers.flat(Infinity).some(l=>l.id.startsWith("transit-trains-")));
  await page.waitForTimeout(400);
  const a=await layerState();
  assert.equal(a.length,4);assert.ok(a.every(l=>l.count===6 && l.pickable===false && l.before==="county-outlines"));
  await page.evaluate(()=>window.trainData=window.deck._deck.props.layers.flat(Infinity).find(l=>l.id.startsWith("transit-trains-")).props.data);
  await page.waitForTimeout(400);
  const b=await layerState();assert.ok(b[0].time>a[0].time);
  assert.ok(await page.evaluate(()=>window.trainData===window.deck._deck.props.layers.flat(Infinity).find(l=>l.id.startsWith("transit-trains-")).props.data));
  const order=await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).map(l=>l.id));
  assert.ok(order.indexOf("transit-core")<order.findIndex(id=>id.startsWith("transit-trains-")));
  assert.ok(order.findLastIndex(id=>id.startsWith("transit-trains-"))<order.indexOf("transit-stations"));
  assert.equal(order.at(-1),"transit-station-labels");
  const pause=page.getByRole("button",{name:"Pause train motion",exact:true});
  await pause.focus();await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const frozen=await layerState();await page.waitForTimeout(400);assert.deepEqual(await layerState(),frozen);
  await page.getByRole("button",{name:"Play train motion",exact:true}).focus();await page.keyboard.press("Space");
  await page.waitForTimeout(400);assert.ok((await layerState())[0].time>frozen[0].time);
  // Runtime preference changes disable motion, and returning to normal does not restart it.
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.waitForFunction(()=>!window.deck._deck.props.layers.flat(Infinity).some(l=>l.id.startsWith("transit-trains-")));
  assert.equal(await toggle.isChecked(),false);
  await page.emulateMedia({reducedMotion:"no-preference"});
  assert.equal(await toggle.isChecked(),false);
  await toggle.check();await page.waitForTimeout(1200);
  await page.getByRole("button",{name:"Pause train motion",exact:true}).click();
  await page.locator(".train-motion-controls").scrollIntoViewIfNeeded();
  const box=await page.locator(".train-motion-controls").boundingBox();
  assert.ok(box.x>=0 && box.x+box.width<=width && box.height>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${output}/${name}-controls.png`});
  await toggle.uncheck();await page.waitForTimeout(100);
  assert.deepEqual(await layerState(),[]);
  const after=await page.evaluate(()=>window.deck._deck.props.layers.flat(Infinity).filter(l=>l.id.startsWith("transit-")).map(l=>({id:l.id,data:JSON.stringify(l.props.data)})));
  assert.deepEqual(after,underlying);
  await toggle.check();await page.waitForTimeout(100);
  await page.getByRole("checkbox",{name:"Existing transit",exact:true}).uncheck();await page.waitForTimeout(150);
  assert.ok(await page.evaluate(()=>!window.deck._deck.props.layers.flat(Infinity).some(l=>l.id.startsWith("transit-"))));
  assert.deepEqual(errors,[]);
  console.log(`PASS train motion ${name}: keyboard toggle/pause/resume, reduced-motion default and live changes, cached timestamps, draw order, readable underlying layers, off cleanup, mobile fit`);
  await page.close();
 }
} finally {await browser.close();}
