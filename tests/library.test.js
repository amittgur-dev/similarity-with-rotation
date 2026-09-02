import { test } from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_KEY, readLibrary, listCanvases, saveToLibrary, loadFromLibrary, removeFromLibrary } from "../src/library.js";

function fakeStorage(init={}){
  const m=new Map(Object.entries(init));
  return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};
}

test("empty or missing storage reads as an empty library", ()=>{
  assert.deepEqual(readLibrary(fakeStorage()).canvases,{});
  assert.deepEqual(readLibrary(null).canvases,{});
  assert.deepEqual(listCanvases(fakeStorage()),[]);
});

test("corrupt storage is ignored rather than crashing", ()=>{
  assert.deepEqual(readLibrary(fakeStorage({[LIBRARY_KEY]:"{not json"})).canvases,{});
  assert.deepEqual(readLibrary(fakeStorage({[LIBRARY_KEY]:'{"canvases":3}'})).canvases,{});
});

test("save, list (most recent first), load, overwrite, remove", ()=>{
  const s=fakeStorage();
  const a={version:3,name:"a",tray:[],items:[],questions:[]};
  const b={version:3,name:"b",tray:[{id:1}],items:[],questions:[]};
  assert.equal(saveToLibrary(s,"  pilot A ",a,new Date("2026-01-01T10:00:00Z")),"pilot A","name is trimmed");
  saveToLibrary(s,"pilot B",b,new Date("2026-01-02T10:00:00Z"));
  assert.deepEqual(listCanvases(s).map(c=>c.name),["pilot B","pilot A"]);
  assert.deepEqual(loadFromLibrary(s,"pilot B"),b);
  assert.equal(loadFromLibrary(s,"nope"),null);
  // saving under an existing name overwrites and bumps it to the top
  saveToLibrary(s,"pilot A",{...a,items:[{id:9}]},new Date("2026-01-03T10:00:00Z"));
  assert.deepEqual(listCanvases(s).map(c=>c.name),["pilot A","pilot B"]);
  assert.equal(loadFromLibrary(s,"pilot A").items.length,1);
  assert.equal(removeFromLibrary(s,"pilot B"),true);
  assert.equal(removeFromLibrary(s,"pilot B"),false);
  assert.deepEqual(listCanvases(s).map(c=>c.name),["pilot A"]);
  // what sits in storage is plain JSON a file export could also carry
  const stored=JSON.parse(s._m.get(LIBRARY_KEY));
  assert.equal(stored.version,1);
  assert.equal(stored.canvases["pilot A"].data.name,"a");
});

test("a blank name is refused", ()=>{
  assert.throws(()=>saveToLibrary(fakeStorage(),"   ",{}),/needs a name/);
});
