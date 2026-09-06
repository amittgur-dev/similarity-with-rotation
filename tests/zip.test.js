import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, buildZip } from "../src/zip.js";

test("crc32 matches the reference value for a known string", ()=>{
  assert.equal(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog")),0x414FA339);
  assert.equal(crc32(new Uint8Array(0)),0);
});

test("buildZip writes a valid store-only archive", ()=>{
  const z=buildZip([{name:"a.txt",data:"hello"},{name:"dir/b.bin",data:new Uint8Array([1,2,3])}],new Date(2026,0,2,3,4,6));
  const dv=new DataView(z.buffer);
  assert.equal(dv.getUint32(0,true),0x04034b50,"local header signature");
  assert.equal(dv.getUint32(z.length-22,true),0x06054b50,"end of central directory");
  assert.equal(dv.getUint16(z.length-22+10,true),2,"two entries");
  const cdOffset=dv.getUint32(z.length-22+16,true);
  assert.equal(dv.getUint32(cdOffset,true),0x02014b50,"central directory at the recorded offset");
  const txt=new TextDecoder().decode(z);
  assert.ok(txt.includes("a.txt")&&txt.includes("dir/b.bin")&&txt.includes("hello"));
  assert.equal(dv.getUint32(14,true),crc32(new TextEncoder().encode("hello")),"crc of the first entry");
  assert.equal(dv.getUint32(18,true),5,"stored size");
});
