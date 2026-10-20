const { chromium } = require('/home/aliemad/projects/pitchiq/node_modules/@playwright/test');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1200}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8903/',{waitUntil:'networkidle'});
 await page.locator('summary').click();
 assert.equal(await page.locator('[data-concept]').count(),30);
 for(let i=0;i<30;i++){
  await page.locator(`[data-concept="${i}"]`).click();
  await page.locator('#restart').click();
  await page.locator('#sim').click();
  assert.match(await page.locator('.comparison .eyebrow').innerText(),/SAME 1 FIXTURES/);
  assert.equal(await page.locator('tbody tr').count(),20);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,`desktop overflow ${i+1}`);
 }
 await page.locator('[data-concept="16"]').click();
 await page.locator('summary').click();
 await page.locator('#save').click();
 await page.reload();
 assert.match(await page.locator('#selected').innerText(),/17 — Sunday paper/);
 assert.match(await page.locator('#label').innerText(),/17 \/ Sunday paper/);
 await page.screenshot({path:'/home/aliemad/projects/classic-gallery/desktop.png',fullPage:true});
 await page.selectOption('#season','0');
 await page.evaluate(()=>window.classicGallery.advance(42));
 assert.match(await page.locator('.comparison .eyebrow').innerText(),/SAME 42 FIXTURES/);
 assert.match(await page.locator('.standings small').innerText(),/462 \/ 462/);
 assert.equal(await page.locator('#sim').isDisabled(),true);
 await page.setViewportSize({width:390,height:844});
 for(let i=0;i<30;i++){
  await page.evaluate(i=>window.classicGallery.choose(i),i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`mobile overflow ${i+1}`);
 }
 await page.evaluate(()=>window.classicGallery.choose(0));
 await page.screenshot({path:'/home/aliemad/projects/classic-gallery/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: 30 desktop loops, 30 mobile overflow checks, 42-fixture/462-game completion, choice persistence, no browser errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

