// Drives the original single-file prototype and the modular app through the
// same interaction script and diffs the resulting DOM + save file.
import { chromium } from "playwright";
import fs from "node:fs";
/* Usage (from stimulus-builder/):
     python3 -m http.server 8765 &        # serves index.html and prototype/
     node tests/browser/compare-with-prototype.mjs http://localhost:8765 /tmp/out
   Needs playwright + chromium (npm i -g playwright && npx playwright install chromium).
   Exit code 0 = the modular app and prototype/index-v9.html behaved identically. */
const BASE=process.argv[2]||"http://localhost:8765";
const OUT=process.argv[3]||".";

async function run(url,tag){
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto(url);
  // native drag of a stray text selection cancels pointer sequences in both versions (see README rough edges)
  await page.evaluate(()=>document.addEventListener("dragstart",e=>e.preventDefault()));
  const btn=name=>page.getByRole("button",{name,exact:true});
  const create=async(shape,sub)=>{
    await page.fill("#shapeInput",shape);await page.press("#shapeInput","Enter");
    await page.fill("#anchorInput",sub);await page.press("#anchorInput","Enter");
    await page.waitForTimeout(600); // fly animation
  };
  const dragTray=async(idx,x,y)=>{
    const box=await page.locator(".trayItem").nth(idx).boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+20);
    await page.mouse.down();
    await page.mouse.move(x,y,{steps:8});
    await page.mouse.up();
  };
  const dragCanvas=async(x0,y0,x1,y1,shift=false)=>{
    if(shift)await page.keyboard.down("Shift"); // rubber band: shift-drag in the app, plain drag in the prototype (shift is ignored there)
    await page.mouse.move(x0,y0);await page.mouse.down();
    await page.mouse.move(x1,y1,{steps:10});await page.mouse.up();
    if(shift)await page.keyboard.up("Shift");
  };
  const blur=()=>page.evaluate(()=>document.activeElement&&document.activeElement.blur());

  await create("square 30","diamond 15");
  await create("hexagon","triangle");
  await create("5 star","circle");
  await create("circle","");

  await dragTray(0,200,150);
  await page.fill('#selSpecs input[data-f="baseRot"]',"75");
  await dragTray(0,120,420);
  await page.fill('#selSpecs input[data-f="anchorRot"]',"60");
  await page.click('#selSpecs .seg[data-f="frame"] button[data-v="vertex"]');
  await dragTray(0,320,420);
  await page.fill('#selSpecs input[data-f="size"]',"120");
  await page.fill('#selSpecs input[data-f="anchorRatio"]',"24");
  await btn("C").click();
  // rubber band → question
  await dragCanvas(50,60,420,520,true);
  await btn("make similarity question").click();
  await page.fill("#qRelDeg","30");
  await btn("make group").click();
  await page.click('#gvMode button[data-v="reference"]');
  await btn("make group").click();
  await page.fill("#qTitle","edited title & <check>");
  await page.fill("#qSize","80");
  await page.fill("#qRatio","30");
  await page.fill('#qMembers input[data-f="anchorRot"]',"5");
  // double-click a member of the first question and edit it
  await page.locator("g.item[data-id='6'] path").first().dispatchEvent("dblclick",{bubbles:true});
  await page.fill('#selSpecs input[data-f="baseRot"]',"10");
  await btn("done").click();
  // single-object variants
  await dragTray(1,600,150);
  await page.click('#rvScope button[data-v="shape"]');
  await page.fill("#rvDeg","60");
  await btn("make variant").click();
  await page.click('#rvScope button[data-v="anchors"]');
  await btn("make variant").click();
  await page.click('#rvScope button[data-v="whole"]');
  await btn("make variant").click();
  // vary grid
  await dragTray(2,600,450);
  await page.fill("#varyInput","shape 0,45 sub 0:30:60");
  await page.press("#varyInput","Enter");
  // duplicate / delete / keyboard
  await dragTray(3,750,600);
  await btn("duplicate").click();
  await blur();
  await page.keyboard.press("Delete");
  await dragTray(3,700,650);
  await blur();
  await page.keyboard.down("Control");await page.keyboard.press("d");await page.keyboard.up("Control");
  // rotate handle + scale handle drags on the selected duplicate
  const rot=await page.locator('[data-h="rot"]').boundingBox();
  await dragCanvas(rot.x+rot.width/2,rot.y+rot.height/2,rot.x+60,rot.y+60);
  const sc=await page.locator('[data-h="scale"]').boundingBox();
  await dragCanvas(sc.x+sc.width/2,sc.y+sc.height/2,sc.x+30,sc.y+30);
  // multi-select + delete all (includes grouped members, which must survive)
  await dragCanvas(560,80,915,760,true);
  await btn("delete all").click();
  // pan / zoom / space-pan
  await page.mouse.move(400,300);
  await page.mouse.wheel(0,40);
  await page.keyboard.down("Control");await page.mouse.wheel(0,-100);await page.keyboard.up("Control");
  await blur();
  await page.keyboard.down("Space");await dragCanvas(400,300,430,320);await page.keyboard.up("Space");
  // click question title text → selects; ungroup the second question
  await page.click('text[data-qid="12"]');
  await btn("ungroup").click();
  // save
  await page.fill("#canvasName","compare run");
  // the app downloads via "export"; the prototype via "save"
  const dlBtn=(await btn("export").count())?btn("export"):btn("save");
  const [dl]=await Promise.all([page.waitForEvent("download"),dlBtn.click()]);
  const json=fs.readFileSync(await dl.path(),"utf8");
  const snap=await page.evaluate(()=>({
    svg:document.getElementById("canvas").innerHTML,
    steps:document.getElementById("steps").innerHTML,
    tray:document.getElementById("tray").innerHTML.replace(/ class="trayItem[^"]*"/g,' class="trayItem"'),
    zoom:document.getElementById("zoomBadge").textContent,
    hint:document.getElementById("emptyHint").style.display,
    panel:[...document.querySelectorAll(".panel.on")].map(p=>p.id).join(),
  }));
  // reload the saved file and snapshot again
  await page.reload();
  await page.setInputFiles("#loadFile",{name:"c.json",mimeType:"application/json",buffer:Buffer.from(json)});
  await page.waitForTimeout(200);
  const after=await page.evaluate(()=>({
    svg:document.getElementById("canvas").innerHTML,
    tray:document.getElementById("tray").innerHTML.replace(/ class="trayItem[^"]*"/g,' class="trayItem"'),
    name:document.getElementById("canvasName").value,
  }));
  await page.screenshot({path:`${OUT}/shot-${tag}.png`});
  await browser.close();
  return {json,snap,after,errors};
}

const a=await run(`${BASE}/prototype/index-v9.html`,"original");
const b=await run(`${BASE}/index.html`,"modular");
let ok=true;
const cmp=(label,x,y)=>{
  if(x===y){console.log("same  ",label,`(${x.length} chars)`);return;}
  ok=false;console.log("DIFF  ",label);
  fs.writeFileSync(`${OUT}/diff-${label}-a.txt`,x);fs.writeFileSync(`${OUT}/diff-${label}-b.txt`,y);
};
cmp("save.json",a.json,b.json);
// button handler attributes and the creation-panel help note legitimately differ
// A/B/C labels deliberately sit lower than in the prototype: drop their y before comparing
const stripLabelY=s=>s.replace(/(<text x="[^"]*") y="[^"]*"( text-anchor="middle" font-family="monospace" font-size="15")/g,"$1$2");
const stripHandlers=s=>s.replace(/ onclick="[^"]*"/g,"").replace(/ data-action="[^"]*"/g,"").replace(/<p class="note">to build a question[^<]*<\/p>/,"");
for(const k of Object.keys(a.snap))cmp("snap."+k,stripLabelY(stripHandlers(String(a.snap[k]))),stripLabelY(stripHandlers(String(b.snap[k]))));
for(const k of Object.keys(a.after))cmp("after."+k,stripLabelY(String(a.after[k])),stripLabelY(String(b.after[k])));
console.log("errors original:",a.errors,"\nerrors modular:",b.errors);
if(a.errors.length||b.errors.length)ok=false;
console.log(JSON.parse(a.json).items.length,"items,",JSON.parse(a.json).questions.length,"questions in save");
console.log(ok?"IDENTICAL":"MISMATCH");
process.exit(ok?0:1);
