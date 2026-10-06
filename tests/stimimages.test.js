import { test } from "node:test";
import assert from "node:assert/strict";
import { planImages, stimulusImageSVG, imageManifest, buildImagesZip, stimulusRecord, stimulusStem, IMAGE_MANIFEST_COLS } from "../src/stimimages.js";
import { parseShape, figureExtent, BASE_R } from "../src/geometry.js";

const SQ=parseShape("square"), DI=parseShape("diamond"), TRI=parseShape("triangle");
const tA={id:1,def:SQ,anchor:DI}, tB={id:2,def:TRI,anchor:{none:true}};
const it=(id,tray,baseRot,anchorRot,extra={})=>({id,trayRef:tray,x:0,y:0,scale:1,baseRot,anchorRot,frame:"screen",anchorRatio:0.18,label:null,qId:null,...extra});
const items=[it(10,tA,0,0),it(11,tA,45,0),it(12,tA,0,0),it(13,tB,90,0,{scale:1.5}),it(14,tA,0,45,{texture:4,anchorRatio:0.1})];
const questions=[{id:20,a:10,b:11,c:13},{id:21,a:12,b:11,c:14,d:13}];
const text=b=>new TextDecoder().decode(b);   // stored (uncompressed) zip; names and text are UTF-8

test("one image per distinct stimulus; identical figures share one, with every use listed", ()=>{
  const p=planImages(items,questions,{size:400});
  assert.equal(p.entries.length,4,"objects 10 and 12 are the same figure");
  const e10=p.entries.find(e=>e.objects.includes(10));
  assert.deepEqual(e10.objects,[10,12]);assert.deepEqual(e10.usedIn,["Q1:A","Q2:A"]);
  assert.deepEqual(p.entries.find(e=>e.objects.includes(13)).usedIn,["Q1:C","Q2:D"]);
  assert.equal(planImages(items,questions,{size:400,unique:false}).entries.length,5,"or one per object");
  assert.equal(new Set(p.entries.map(e=>e.stem)).size,4);
  assert.match(p.entries[0].stem,/^S001_square-diamond_b000_s000_screen_r18_x100$/);
  assert.match(stimulusStem(stimulusRecord(items[3]),9),/^S009_triangle-solid_b090_x150$/);
});

test("every image is exactly size × size, at one scale that fits the largest figure at any rotation", ()=>{
  const p=planImages(items,questions,{size:300,margin:0.1});
  const maxR=Math.max(...p.entries.map(e=>e.radius));
  assert.ok(Math.abs(maxR*p.k-300*0.8/2)<1e-9,"the largest figure spans the image minus the margins");
  assert.equal(maxR,figureExtent(TRI,{none:true},0.18,0).radius*BASE_R*1.5,"the 1.5× triangle is the largest");
  for(const e of p.entries){
    const svg=stimulusImageSVG(e.rec,p.size,p.k);
    assert.match(svg,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="300" height="300" viewBox="(-?[\d.]+) \1 [\d.]+ [\d.]+">/);
    assert.ok(svg.includes('fill="#fff"'),"white background");
  }
  assert.equal(p.clipped.length,0);
  // a fixed scale that is too large is reported, not silently clipped
  const f=planImages(items,questions,{size:300,mode:"fixed",pxPerUnit:3});
  assert.equal(f.k,3);assert.ok(f.clipped.length>0);
  assert.equal(planImages(items,questions,{size:99999}).size,4096,"size is clamped");
});

test("manifest: parameters, sizes in image pixels and mm, objects and roles; the zip holds them all", async ()=>{
  const p=planImages(items,questions,{size:256});
  const rows=imageManifest(p,{pxPerMm:4});
  assert.deepEqual(Object.keys(rows[0]),IMAGE_MANIFEST_COLS);
  const tex=rows.find(r=>r.arrangement==="texture");
  assert.equal(tex.density,4);assert.equal(tex.subRot,45);assert.equal(tex.image_px,256);
  assert.ok(rows.every(r=>r.figure_width_px>0&&r.figure_width_px<=256&&r.figure_height_px<=256));
  const solid=rows.find(r=>r.sub==="none");
  assert.equal(solid.arrangement,"");assert.equal(solid.frame,"");
  let calls=0;
  const zip=text(await buildImagesZip(p,{rasterize:async(svg,size)=>{calls++;assert.equal(size,256);return new Uint8Array([137,80,78,71]);},canvas:"demo",pxPerMm:4,calibrated:true}));
  assert.equal(calls,4);
  for(const r of rows){assert.ok(zip.includes(r.file_png));assert.ok(zip.includes(r.file_svg));}
  assert.ok(zip.includes("manifest.csv")&&zip.includes("manifest.xlsx")&&zip.includes("README.txt"));
  assert.ok(zip.includes("exactly 256 × 256 pixels"));
});
