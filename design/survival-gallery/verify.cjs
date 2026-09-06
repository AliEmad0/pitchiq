const {chromium}=require('@playwright/test');
(async()=>{
 const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:1000}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file:///home/aliemad/projects/pitchiq/artifacts/survival-gallery/survival-concepts.html');
 await p.waitForSelector('#stage .concept');
 const signatures=[];
 for(let i=0;i<30;i++){
  await p.evaluate(i=>{window.survivalGallery.choose(i);window.survivalGallery.reset()},i);
  signatures.push(await p.locator('#stage .concept').evaluate(el=>JSON.stringify([...el.querySelectorAll('.identity,.metric,.table,.pitch,.next,.dial,.fixtures,.rail')].map(x=>{const r=x.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}))));
  const before=await p.evaluate(()=>window.survivalGallery.state());
  await p.locator('#sim').click();const after=await p.evaluate(()=>window.survivalGallery.state());
  if(after.results<=before.results||after.remaining!==before.remaining-1)throw Error('Simulation failed '+i);
 }
 console.log('Distinct geometry signatures',new Set(signatures).size);
 if(new Set(signatures).size!==30)throw Error('Layouts are not all distinct');
 await p.evaluate(()=>{window.survivalGallery.choose(0);window.survivalGallery.reset()});
 await p.screenshot({path:'artifacts/survival-gallery/desktop.png',fullPage:true});
 await p.locator('summary').click();
 const choice=await p.locator('[data-slot="0"]').evaluate(el=>[...el.options].find(o=>!o.disabled&&o.value!==el.value)?.value);
 if(!choice)throw Error('Missing real reserve keeper for rotation');
 await p.locator('[data-slot="0"]').selectOption(choice);
 if((await p.evaluate(()=>window.survivalGallery.state())).cards[0]!==choice)throw Error('Rotation failed');
 await p.locator('summary').click();
 await p.locator('#pick').click();await p.locator('#sim').click();
 const saved=await p.evaluate(()=>window.survivalGallery.state());await p.reload();
 const restored=await p.evaluate(()=>window.survivalGallery.state());
 if(saved.results!==restored.results||saved.points!==restored.points)throw Error('Resume changed campaign');
 if(!(await p.locator('#choice').textContent()).includes('01 / The Lifeline'))throw Error('Choice lost');
 await p.setViewportSize({width:390,height:844});
 for(let i=0;i<30;i++){
  await p.evaluate(i=>window.survivalGallery.choose(i),i);
  if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow '+i);
 }
 await p.evaluate(()=>window.survivalGallery.choose(0));await p.screenshot({path:'artifacts/survival-gallery/mobile.png',fullPage:true});
 await p.setViewportSize({width:1440,height:1000});await p.locator('#toggle').click();
 if(await p.locator('.tile').count()!==30)throw Error('Missing tiles');
 await p.screenshot({path:'artifacts/survival-gallery/overview.png',fullPage:true});
 await p.evaluate(()=>{window.survivalGallery.reset();window.survivalGallery.advance(42)});
 for(let i=0;i<8;i++){
  if(await p.locator('#forfeit').isVisible())await p.locator('#forfeit').click();
  if(await p.locator('#finish').isEnabled())await p.locator('#finish').click();
 }
 if((await p.evaluate(()=>window.survivalGallery.state())).remaining!==0)throw Error('Run-in did not finish');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: 30 concepts simulate, 30 distinct geometries, mobile widths, full run-in, reload and saved choice.');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
