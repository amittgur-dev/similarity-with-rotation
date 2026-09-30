import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPdf, pdfString, fitText, questionSheetPdf, questionOps } from "../src/pdf.js";
import { paramRecord } from "../src/experiment.js";

const SQ={n:4,offset:45,name:"square"}, DI={n:4,name:"diamond"};
const mk=(baseRot,anchorRot,extra={})=>paramRecord({trayRef:{def:SQ,anchor:DI},baseRot,anchorRot,frame:"screen",anchorRatio:0.18,scale:1,...extra});
const trial=(d=false)=>({qId:1,title:"t",s:1,A:mk(0,0),B:mk(45,0),C:mk(0,45),...(d?{D:mk(45,45)}:{})});
const latin=b=>String.fromCharCode(...b);

test("PDF strings: escaping and WinAnsi mapping", ()=>{
  assert.equal(pdfString("a(b)\\c"),"(a\\(b\\)\\\\c)");
  assert.equal(pdfString("Q1 · x"),"(Q1 \xB7 x)");
  assert.equal(pdfString("…★"),"(\x85?)");
  assert.ok(fitText("a".repeat(200),8,100).endsWith("…"));
  assert.equal(fitText("short",8,100),"short");
});

test("writer: header, objects at their xref offsets, page count", ()=>{
  const s=latin(buildPdf([{w:100,h:100,content:"0 g 0 0 10 10 re f"},{w:100,h:100,content:"BT ET"}],{title:"x"}));
  assert.ok(s.startsWith("%PDF-1.4"));assert.ok(s.trimEnd().endsWith("%%EOF"));
  assert.match(s,/\/Type \/Pages \/Kids \[[^\]]+\] \/Count 2/);
  const xref=+s.match(/startxref\n(\d+)/)[1];
  assert.ok(s.slice(xref).startsWith("xref"));
  const offs=[...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m=>+m[1]);
  offs.forEach((o,i)=>assert.ok(s.slice(o).startsWith(`${i+1} 0 obj`),`object ${i+1} sits at its offset`));
  // every stream's /Length is its byte length
  for(const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)){
    const start=m.index+m[0].length;
    assert.equal(s.slice(start+ +m[1],start+ +m[1]+10),"\nendstream");
  }
});

test("question sheet: six per page, every element drawn, labels, footer scale", ()=>{
  const entries=Array.from({length:7},(_,i)=>({index:i+1,title:`Q${i+1} · square/diamond`,codes:i?"":"E1",trial:trial(i===6)}));
  const s=latin(questionSheetPdf(entries,{canvas:"demo (v2)",date:"30/09/2026",pxPerMm:4,calibrated:true}));
  assert.match(s,/\/Count 2/);
  assert.ok(s.includes("(demo \\(v2\\))"));
  assert.ok(s.includes("(page 1 of 2)")||s.includes("page 1 of 2"));
  assert.ok(s.includes("10 mm on screen"));
  // one question: 4 members × 4 sub-shapes = 16 filled paths; the D question adds 4 more and a D label
  const map=p=>p, ops3=questionOps(trial(),map,1), ops4=questionOps(trial(true),map,1);
  assert.equal((ops3.match(/ h f\n/g)||[]).length,12);assert.equal((ops4.match(/ h f\n/g)||[]).length,16);
  assert.ok(ops4.includes("(D) Tj")&&!ops3.includes("(D) Tj"));
  // textures and solid circles use the same primitives
  const tex=questionOps({...trial(),A:mk(0,0,{texture:4})},map,1);
  assert.equal((tex.match(/ h f\n/g)||[]).length,16+8);
});
