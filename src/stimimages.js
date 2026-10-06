/* Stimulus images: every distinct stimulus on the canvas — each figure, not
   each question — as its own image, all of one fixed pixel size and one
   scale, each centred on the figure's rotation centre, with a manifest.
   Pure: rasterisation is passed in (stimexport.svgToPng in the app). */

import { BASE_R, DEFAULT_RATIO, norm, shapeMarkup, shapePrimitives, primitivesBBox, figureExtent } from "./geometry.js";
import { buildZip } from "./zip.js";
import { buildXlsx } from "./xlsx.js";

export const IMAGES_KEY="stimulus-builder.images";
export const IMAGE_DEFAULTS={size:512,mode:"fit",pxPerUnit:2,margin:0.08,unique:true,svg:true};
export const IMAGE_SIZE_MIN=64, IMAGE_SIZE_MAX=4096;

/* everything that changes how one canvas object looks */
export function stimulusRecord(it){
  const anchor=it.trayRef.anchor;
  return {def:it.trayRef.def,anchor,baseRot:norm(it.baseRot),anchorRot:anchor&&!anchor.none?norm(it.anchorRot):0,
          frame:anchor&&!anchor.none?it.frame:"",ratio:anchor&&!anchor.none?+(it.anchorRatio||DEFAULT_RATIO).toFixed(4):0,
          texture:anchor&&!anchor.none?(it.texture||0):0,scale:+(+it.scale).toFixed(4)};
}
/* identical figures share one image */
export const stimulusKey=r=>JSON.stringify([r.def,r.anchor,r.baseRot,r.anchorRot,r.frame,r.ratio,r.texture,r.scale]);
const pad3=v=>String(Math.round(v)).padStart(3,"0");
const safe=s=>String(s).replace(/[^a-z0-9-]+/gi,"-");
/* a descriptive, sortable file stem: S007_square-diamond_b045_s000_screen_r18_x100 */
export function stimulusStem(r,i){
  const sub=r.anchor&&!r.anchor.none?r.anchor.name:"solid";
  return `S${String(i).padStart(3,"0")}_${safe(r.def.name)}-${safe(sub)}_b${pad3(r.baseRot)}`+
         (sub!=="solid"?`_s${pad3(r.anchorRot)}_${r.frame}${r.texture?`_tex${r.texture}`:""}_r${Math.round(r.ratio*100)}`:"")+
         `_x${Math.round(r.scale*100)}`;
}
const prims=r=>shapePrimitives(r.def,BASE_R,r.anchor,r.frame||"screen",r.baseRot,r.anchorRot,r.ratio||DEFAULT_RATIO,r.texture);
/* radius bounding the figure at every orientation, in canvas pixels */
export function stimulusRadius(r){
  return figureExtent(r.def,r.anchor,r.ratio||DEFAULT_RATIO,r.texture).radius*BASE_R*r.scale;
}
/* the image of one stimulus: size × size pixels, k image pixels per canvas pixel */
export function stimulusImageSVG(r,size,k){
  const h=+(size/2/k).toFixed(6);   // half the image in canvas px (rounded: clean numbers in the file, error < 1e-6 px)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-h} ${-h} ${2*h} ${2*h}">`+
         `<rect x="${-h}" y="${-h}" width="${2*h}" height="${2*h}" fill="#fff"/>`+
         `<g transform="scale(${r.scale})">${shapeMarkup(r.def,BASE_R,r.anchor,r.frame||"screen",r.baseRot,r.anchorRot,r.ratio||DEFAULT_RATIO,r.texture)}</g></svg>`;
}

/* What will be exported: one entry per stimulus (or per object), the scale,
   and anything that would not fit. items/questions as on the canvas. */
export function planImages(items,questions,opts={}){
  const o={...IMAGE_DEFAULTS,...opts};
  const size=Math.max(IMAGE_SIZE_MIN,Math.min(IMAGE_SIZE_MAX,Math.round(+o.size)||IMAGE_DEFAULTS.size));
  const roles=new Map();   // object id → ["Q3:B", …]
  questions.forEach((q,qi)=>[["A",q.a],["B",q.b],["C",q.c],["D",q.d]].forEach(([l,id])=>{
    if(id==null)return;
    if(!roles.has(id))roles.set(id,[]);
    roles.get(id).push(`Q${qi+1}:${l}`);
  }));
  const entries=[], byKey=new Map();
  items.forEach(it=>{
    const rec=stimulusRecord(it), key=o.unique?stimulusKey(rec):`object:${it.id}`;
    let e=byKey.get(key);
    if(!e){e={key,rec,objects:[],usedIn:[]};byKey.set(key,e);entries.push(e);}
    e.objects.push(it.id);
    e.usedIn.push(...(roles.get(it.id)||["free"]));
  });
  entries.forEach((e,i)=>{e.stem=stimulusStem(e.rec,i+1);e.radius=stimulusRadius(e.rec);});
  const maxR=Math.max(0,...entries.map(e=>e.radius));
  const k=o.mode==="fixed"?Math.max(0.01,+o.pxPerUnit||IMAGE_DEFAULTS.pxPerUnit):(maxR?size*(1-2*o.margin)/(2*maxR):1);
  const clipped=entries.filter(e=>e.radius*k>size/2+1e-9).map(e=>e.stem);
  return {size,k,entries,clipped,maxRadius:maxR,svg:!!o.svg,mode:o.mode,margin:o.margin};
}

export const IMAGE_MANIFEST_COLS=["file_png","file_svg","stimulus","shape","sub","arrangement","density","baseRot","subRot","frame","subRatio","scale",
  "image_px","image_px_per_canvas_px","figure_width_px","figure_height_px","figure_width_mm_on_screen","figure_height_mm_on_screen","objects","used_in"];
export function imageManifest(plan,{pxPerMm=96/25.4}={}){
  return plan.entries.map(e=>{
    const r=e.rec, bb=primitivesBBox(prims(r));
    const sub=r.anchor&&!r.anchor.none?r.anchor.name:"none";
    return {file_png:`${e.stem}.png`,file_svg:plan.svg?`${e.stem}.svg`:"",stimulus:e.stem.slice(0,4),shape:r.def.name,sub,
            arrangement:sub==="none"?"":(r.texture?"texture":"vertices"),density:r.texture||"",baseRot:r.baseRot,subRot:r.anchorRot,frame:r.frame,
            subRatio:r.ratio||"",scale:r.scale,image_px:plan.size,image_px_per_canvas_px:+plan.k.toFixed(6),
            figure_width_px:+(bb.w*r.scale*plan.k).toFixed(2),figure_height_px:+(bb.h*r.scale*plan.k).toFixed(2),
            figure_width_mm_on_screen:+(bb.w*r.scale/pxPerMm).toFixed(2),figure_height_mm_on_screen:+(bb.h*r.scale/pxPerMm).toFixed(2),
            objects:e.objects.join(" "),used_in:e.usedIn.join(" ")};
  });
}
function csv(rows,cols){
  const cell=v=>{const s=v==null?"":String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return [cols.join(","),...rows.map(r=>cols.map(c=>cell(r[c])).join(","))].join("\n")+"\n";
}
/* the zip: <stem>.png (+ .svg) per stimulus, manifest.csv/.xlsx, README.txt */
export async function buildImagesZip(plan,{rasterize,canvas="",pxPerMm=96/25.4,calibrated=false,onProgress=()=>{}}){
  const files=[];
  for(let i=0;i<plan.entries.length;i++){
    const e=plan.entries[i], svg=stimulusImageSVG(e.rec,plan.size,plan.k);
    files.push({name:`${e.stem}.png`,data:await rasterize(svg,plan.size)});
    if(plan.svg)files.push({name:`${e.stem}.svg`,data:svg});
    onProgress(i+1,plan.entries.length);
  }
  const rows=imageManifest(plan,{pxPerMm});
  files.push({name:"manifest.csv",data:csv(rows,IMAGE_MANIFEST_COLS)});
  files.push({name:"manifest.xlsx",data:buildXlsx([{name:"stimuli",rows,columns:IMAGE_MANIFEST_COLS}])});
  files.push({name:"README.txt",data:
`Stimulus images exported from Similarity with rotation${canvas?` — canvas "${canvas}"`:""}.

Every image is exactly ${plan.size} × ${plan.size} pixels, white background, black figure.
All images use one scale: ${plan.k.toFixed(4)} image pixels per canvas pixel${plan.mode==="fit"?` (chosen so the largest stimulus fits at any rotation, with a margin of ${Math.round(plan.margin*100)}% on each side)`:""}.
Relative sizes between stimuli are therefore preserved; show every image at the same size in your experiment.
Each figure is centred on its own rotation centre (the centre of the base shape), so rotated versions line up exactly.

One file per ${plan.entries.length&&plan.entries[0].key.startsWith("object:")?"object on the canvas":"distinct stimulus (identical figures on the canvas share one file)"}.
manifest.csv / manifest.xlsx: file, parameters (shape, sub-shape, arrangement, density, base rotation, sub-shape rotation,
frame, sub-shape relative size, scale), the figure's width/height in image pixels and in mm as drawn on the designer's
${calibrated?"calibrated":"uncalibrated (96 dpi assumed)"} screen at 100% (${pxPerMm.toFixed(3)} px/mm), the canvas object ids, and the questions and roles
that use it (Q3:B = comparison B of question 3; free = not in a question).
Rotations in degrees; frame "screen" keeps sub-shapes at absolute orientation, "vertex" rotates them with the configuration.
`});
  return buildZip(files);
}
