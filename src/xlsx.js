/* Minimal .xlsx writer (Office Open XML, inline strings) on top of the
   store-only zip writer — enough to hand results to Excel, Numbers, R or
   pandas without a library. Pure. */

import { buildZip } from "./zip.js";

const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export function colName(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=(i-m-1)/26;}return s;}

/* rows: array of objects; columns: ordered keys (header row) */
export function sheetXML(rows,columns){
  const line=(vals,r)=>`<row r="${r}">`+vals.map((v,i)=>{
    const ref=colName(i)+r;
    if(typeof v==="number"&&isFinite(v))return `<c r="${ref}"><v>${v}</v></c>`;
    if(v==null||v==="")return "";
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join("")+`</row>`;
  const body=[line(columns,1),...rows.map((row,i)=>line(columns.map(c=>row[c]),i+2))].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
const sheetName=n=>esc(String(n).replace(/[\\/?*[\]:]/g," ").slice(0,31)||"Sheet");

/* sheets: [{name, rows, columns}] → Uint8Array of the .xlsx */
export function buildXlsx(sheets,now=new Date()){
  const files=[];
  files.push({name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`+
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`+
    `<Default Extension="xml" ContentType="application/xml"/>`+
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`+
    sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")+
    `</Types>`});
  files.push({name:"_rels/.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`+
    `</Relationships>`});
  files.push({name:"xl/workbook.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`+
    sheets.map((s,i)=>`<sheet name="${sheetName(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")+
    `</sheets></workbook>`});
  files.push({name:"xl/_rels/workbook.xml.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
    sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")+
    `</Relationships>`});
  sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXML(s.rows,s.columns)}));
  return buildZip(files,now);
}
