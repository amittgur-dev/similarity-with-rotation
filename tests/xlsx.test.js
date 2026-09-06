import { test } from "node:test";
import assert from "node:assert/strict";
import { colName, sheetXML, buildXlsx } from "../src/xlsx.js";

test("column names", ()=>{
  assert.equal(colName(0),"A");assert.equal(colName(25),"Z");assert.equal(colName(26),"AA");assert.equal(colName(27),"AB");assert.equal(colName(701),"ZZ");
});

test("sheet XML: header row, numbers as values, strings inline and escaped, blanks skipped", ()=>{
  const x=sheetXML([{a:1,b:"x & <y>",c:""},{a:2.5,b:null,c:"z"}],["a","b","c"]);
  assert.ok(x.includes('<row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve">a</t></is></c>'));
  assert.ok(x.includes('<c r="A2"><v>1</v></c>'));
  assert.ok(x.includes('<c r="B2" t="inlineStr"><is><t xml:space="preserve">x &amp; &lt;y&gt;</t></is></c>'));
  assert.ok(!x.includes('r="C2"'),"empty cell omitted");
  assert.ok(x.includes('<c r="A3"><v>2.5</v></c>')&&x.includes('r="C3"'));
});

test("buildXlsx: a zip with the OOXML parts and one sheet per input", ()=>{
  const z=buildXlsx([{name:"results",rows:[{q:1}],columns:["q"]},{name:"summary/odd:name that is far too long for excel",rows:[],columns:["k"]}],new Date(2026,0,1));
  const txt=new TextDecoder().decode(z);
  for(const part of ["[Content_Types].xml","_rels/.rels","xl/workbook.xml","xl/_rels/workbook.xml.rels","xl/worksheets/sheet1.xml","xl/worksheets/sheet2.xml"])assert.ok(txt.includes(part),part);
  assert.ok(txt.includes('<sheet name="results" sheetId="1" r:id="rId1"/>'));
  assert.ok(txt.includes('<sheet name="summary odd name that is far to" sheetId="2"'),"sheet name sanitised and trimmed to 31");
  assert.equal(new DataView(z.buffer).getUint32(0,true),0x04034b50);
});
