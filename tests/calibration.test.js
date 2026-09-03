import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_MM, CARD_RATIO, NOMINAL_PX_PER_MM, CALIBRATION_KEY, calib,
  pxPerMmFromCardWidth, cardWidthPxFor, pxToMm, mmToPx, formatMm,
  readCalibration, writeCalibration, clearCalibration, loadCalibration
} from "../src/calibration.js";

function fakeStorage(init={}){
  const m=new Map(Object.entries(init));
  return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
}
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test("the reference card is ISO ID-1", ()=>{
  assert.equal(CARD_MM.w,85.6);assert.equal(CARD_MM.h,53.98);
  close(CARD_RATIO,53.98/85.6);
  close(NOMINAL_PX_PER_MM,3.7795275590551185);
});

test("card width ↔ px/mm ↔ mm conversions round-trip", ()=>{
  const ppm=pxPerMmFromCardWidth(428);   // a card drawn 428 px wide
  close(ppm,5);
  close(cardWidthPxFor(ppm),428);
  close(pxToMm(140,ppm),28);              // a 140 px object is 28 mm
  close(mmToPx(28,ppm),140);
  assert.throws(()=>pxPerMmFromCardWidth(0),/positive/);
});

test("formatMm picks a sensible precision", ()=>{
  assert.equal(formatMm(3.14159),"3.14 mm");
  assert.equal(formatMm(28.04),"28.0 mm");
  assert.equal(formatMm(123.6),"124 mm");
});

test("storage: write, read, load, clear; defaults when absent or corrupt", ()=>{
  const s=fakeStorage();
  assert.equal(readCalibration(s),null);
  loadCalibration(s);
  close(calib.pxPerMm,NOMINAL_PX_PER_MM);assert.equal(calib.calibrated,false);
  const rec=writeCalibration(s,5,{dpr:2});
  assert.equal(rec.dpr,2);assert.ok(rec.when);
  assert.equal(readCalibration(s).pxPerMm,5);
  loadCalibration(s);
  assert.equal(calib.pxPerMm,5);assert.equal(calib.calibrated,true);
  clearCalibration(s);
  loadCalibration(s);
  assert.equal(calib.calibrated,false);
  assert.equal(readCalibration(fakeStorage({[CALIBRATION_KEY]:"nope"})),null);
  assert.equal(readCalibration(fakeStorage({[CALIBRATION_KEY]:'{"pxPerMm":-1}'})),null);
  assert.equal(readCalibration(null),null);
});
