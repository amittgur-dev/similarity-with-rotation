/* Stimulus export: every included question as SVG and PNG, plus a manifest
   (CSV) mapping file → full parameter record. All client-side. */

import { calib, pxToMm, visualAngleDeg } from "./calibration.js";
import { experimentQuestions, experimentCode, questionTrial, stimulusSVG, fileStem, paramColumns } from "./experiment.js";
import { buildZip } from "./zip.js";
import { buildXlsx } from "./xlsx.js";

const MANIFEST_COLS=["file_svg","file_png","canvas","experiment_id","experiment_code","experiment_name","question_index","question_id","question_title","png_scale","px_per_mm","calibrated","viewing_distance_cm",
  ...["A","B","C"].flatMap(k=>["shape","sub","baseRot","subRot","frame","subRatio","scale","width_mm","height_mm","width_deg","height_deg"].map(c=>`${k}_${c}`))];

function csv(rows,cols){
  const cell=v=>{const s=v==null?"":String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return [cols.join(","),...rows.map(r=>cols.map(c=>cell(r[c])).join(","))].join("\n")+"\n";
}
/* rasterise an SVG document string at a scale factor → PNG bytes */
function svgToPng(svgText,scale){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement("canvas");
      c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
      const ctx=c.getContext("2d");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      c.toBlob(b=>b?b.arrayBuffer().then(buf=>resolve(new Uint8Array(buf))):reject(new Error("png failed")),"image/png");
    };
    img.onerror=()=>reject(new Error("svg failed to render"));
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgText);
  });
}
/* sizes of the drawn members, measured by rendering the SVG off-screen */
function memberSizes(svgText){
  const host=document.createElement("div");
  host.style.cssText="position:absolute;left:-10000px;top:0;";
  host.innerHTML=svgText;
  document.body.appendChild(host);
  const out={};
  ["A","B","C"].forEach(k=>{
    const g=host.querySelector(`g[data-m="${k}"]`);
    if(g){const bb=g.getBBox();const s=parseFloat((g.getAttribute("transform").match(/scale\(([^)]+)\)/)||[0,1])[1]);
      out[k]={w:pxToMm(bb.width*s),h:pxToMm(bb.height*s)};}
  });
  host.remove();
  return out;
}

/* returns {blob, count} — the zip and how many questions it holds */
export async function exportStimuli(exp,questions,findItem,{scale=2,canvas="",onProgress=()=>{}}={}){
  const qs=experimentQuestions(exp,questions);
  const files=[], manifest=[], used=new Set();
  let n=0;
  for(const q of qs){
    n++;
    const t=questionTrial(q,findItem);
    if(!t)continue;
    // file names must be unique in the zip (and on case-insensitive file systems)
    let stem=fileStem(q.title,n);
    for(let k=2;used.has(stem.toLowerCase());k++)stem=`${fileStem(q.title,n)}-${k}`;
    used.add(stem.toLowerCase());
    const svg=stimulusSVG(t);
    const png=await svgToPng(svg,scale);
    files.push({name:`${stem}.svg`,data:svg},{name:`${stem}.png`,data:png});
    manifest.push({file_svg:`${stem}.svg`,file_png:`${stem}.png`,canvas,experiment_id:exp.id,experiment_code:experimentCode(exp),experiment_name:exp.name,
                   question_index:n,question_id:q.id,question_title:q.title,png_scale:scale,
                   px_per_mm:calib.pxPerMm,calibrated:calib.calibrated?1:0,viewing_distance_cm:calib.distanceCm,
                   ...paramColumns(t,memberSizes(svg),mm=>visualAngleDeg(mm))});
    onProgress(n,qs.length);
  }
  files.push({name:"manifest.csv",data:csv(manifest,MANIFEST_COLS)});
  files.push({name:"manifest.xlsx",data:buildXlsx([{name:"manifest",rows:manifest,columns:MANIFEST_COLS}])});
  files.push({name:"README.txt",data:
`Stimuli exported from Similarity with rotation.
Each question: <stem>.svg (vector, 1:1 canvas pixels; zoom 100%) and <stem>.png (rasterised at ${scale}× that size).
manifest.csv (and manifest.xlsx) map files to the full parameter record: base shape, sub-shape, both rotations, frame, sub-shape relative size,
scale, and the drawn figure's width/height in mm (calibrated screen) and degrees (viewing distance ${calib.distanceCm} cm).
Rotations are in degrees; frame "screen" keeps sub-shapes at absolute orientation, "vertex" points them outward from the center.
`});
  return {blob:new Blob([buildZip(files)],{type:"application/zip"}),count:manifest.length};
}
