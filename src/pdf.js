/* PDF export of a canvas's questions: a minimal PDF writer (built-in
   Helvetica fonts, filled paths) and the question-sheet layout on top of
   it. Vector output drawn from the same primitives as the SVG stimuli
   (geometry.js shapePrimitives), so print and screen cannot differ. Pure. */

import { BASE_R, shapePrimitives, rotPt } from "./geometry.js";
import { trialGeometry, comparisons } from "./experiment.js";

/* ---- text: PDF strings in WinAnsiEncoding ---- */
const WIN={"…":0x85,"—":0x97,"–":0x96,"’":0x92,"‘":0x91,"“":0x93,"”":0x94,"•":0x95,"€":0x80};
export function pdfString(s){
  let out="";
  for(const ch of String(s)){
    let c=WIN[ch]??ch.charCodeAt(0);
    if(ch==="−")c=45;
    if(c>255||ch.length>1)c=63;   // "?" for anything outside WinAnsi
    const b=String.fromCharCode(c);
    out+=b==="("||b===")"||b==="\\"?"\\"+b:b;
  }
  return "("+out+")";
}
/* rough Helvetica advance widths (em) — enough to fit and centre text */
const W_NARROW="iljtf.,:;|!'I()[] ", W_WIDE="mwMW@%";
export function textWidth(s,size,bold=false){
  let w=0;
  for(const ch of String(s))w+=W_NARROW.includes(ch)?0.28:W_WIDE.includes(ch)?0.83:/[A-Z0-9]/.test(ch)?0.64:0.53;
  return w*size*(bold?1.05:1);
}
export function fitText(s,size,maxW){
  s=String(s);
  if(textWidth(s,size)<=maxW)return s;
  while(s.length>1&&textWidth(s+"…",size)>maxW)s=s.slice(0,-1);
  return s+"…";
}

/* ---- the writer ----
   pages: [{w, h, content}] with content a PDF content stream (ASCII /
   WinAnsi). Fonts: /F1 Helvetica, /F2 Helvetica-Bold. Returns Uint8Array. */
export function buildPdf(pages,{title="",producer="Similarity with rotation"}={}){
  const objs=[];                         // index + 1 = object number
  const add=body=>{objs.push(body);return objs.length;};
  const catalog=add(null), pagesObj=add(null);
  const f1=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids=pages.map(p=>{
    const stream=add(`<< /Length ${p.content.length} >>\nstream\n${p.content}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n(p.w)} ${n(p.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`);
  });
  objs[catalog-1]=`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj-1]=`<< /Type /Pages /Kids [${kids.map(k=>k+" 0 R").join(" ")}] /Count ${kids.length} >>`;
  const info=add(`<< /Title ${pdfString(title)} /Producer ${pdfString(producer)} >>`);
  let out="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets=[];
  objs.forEach((body,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${body}\nendobj\n`;});
  const xref=out.length;
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("");
  out+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes=new Uint8Array(out.length);
  for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;
  return bytes;
}
const n=v=>(Math.round(v*100)/100).toString();

/* ---- drawing helpers (PDF user space: points, origin bottom-left) ---- */
const K=0.5522847498;   // circle as four Béziers
function circleOps(cx,cy,r){
  const k=K*r;
  return `${n(cx+r)} ${n(cy)} m ${n(cx+r)} ${n(cy+k)} ${n(cx+k)} ${n(cy+r)} ${n(cx)} ${n(cy+r)} c `+
         `${n(cx-k)} ${n(cy+r)} ${n(cx-r)} ${n(cy+k)} ${n(cx-r)} ${n(cy)} c `+
         `${n(cx-r)} ${n(cy-k)} ${n(cx-k)} ${n(cy-r)} ${n(cx)} ${n(cy-r)} c `+
         `${n(cx+k)} ${n(cy-r)} ${n(cx+r)} ${n(cy-k)} ${n(cx+r)} ${n(cy)} c h f\n`;
}
function polyOps(pts){
  return pts.map((p,i)=>`${n(p[0])} ${n(p[1])} ${i?"l":"m"}`).join(" ")+" h f\n";
}
function textOps(s,x,y,size,{bold=false,align="left",gray=0.07}={}){
  const w=textWidth(s,size,bold);
  const x0=align==="center"?x-w/2:align==="right"?x-w:x;
  return `${gray} g BT /${bold?"F2":"F1"} ${n(size)} Tf ${n(x0)} ${n(y)} Td ${pdfString(s)} Tj ET\n`;
}

/* One question (a trial record: A, B, C(, D) parameter records and s) drawn
   with its canvas-pixel geometry mapped by `map` ([x,y] svg → [X,Y] pdf)
   and `k` (points per canvas pixel). Comparisons in their natural order. */
export function questionOps(t,map,k){
  const g=trialGeometry({...t,order:null,swapped:false});
  let ops="0.067 g\n";
  for(const m of ["A",...comparisons(t)]){
    const p=t[m], [px,py]=g.positions[m], s=p.scale;
    const place=q=>map([px+s*q[0],py+s*q[1]]);
    for(const pr of shapePrimitives(p.def,BASE_R,p.anchor,p.frame,p.baseRot,p.anchorRot,p.anchorRatio,p.texture||0)){
      if(pr.circle){const [X,Y]=place(pr.circle);ops+=circleOps(X,Y,pr.r*s*k);}
      else ops+=polyOps(pr.poly.map(q=>{const r=pr.at?rotPt(q,pr.rot):q;return place(pr.at?[r[0]+pr.at[0],r[1]+pr.at[1]]:r);}));
    }
    const [lx,ly]=map([px,py+g.labelY]);
    ops+=textOps(m,lx,ly,17*k,{bold:true,align:"center"});
  }
  return ops;
}

/* ---- the question sheet ----
   entries: [{index, title, codes, trial}]; A4 portrait, `cols` × `rows`
   questions per page, one scale for every question so sizes stay
   comparable, a header per page and a footer with the scale. */
export const A4={w:595.28,h:841.89};
export function questionSheetPdf(entries,{canvas="",date="",pxPerMm=96/25.4,calibrated=false,cols=2,rows=3}={}){
  const {w:W,h:H}=A4, M=40, top=58, bottom=58, gapX=18, gapY=14, titleH=16;
  const cw=(W-2*M-gapX*(cols-1))/cols, ch=(H-top-bottom-gapY*(rows-1))/rows;
  const boxes=entries.map(e=>trialGeometry({...e.trial,order:null}).viewBox);
  const k=Math.min(...boxes.map(([,,bw,bh])=>Math.min(cw/bw,(ch-titleH)/bh)));
  const per=cols*rows, nPages=Math.max(1,Math.ceil(entries.length/per));
  const pct=Math.round(k*25.4/72*pxPerMm*100);   // printed size vs the calibrated on-screen size
  const pages=[];
  for(let pg=0;pg<nPages;pg++){
    let c="";
    // header
    c+=textOps(fitText(canvas||"untitled canvas",11,W-2*M-150),M,H-34,11,{bold:true});
    c+=textOps(`${date}  ·  page ${pg+1} of ${nPages}`,W-M,H-34,8.5,{align:"right",gray:0.4});
    c+=`0.85 G 0.5 w ${n(M)} ${n(H-42)} m ${n(W-M)} ${n(H-42)} l S\n`;
    // questions
    entries.slice(pg*per,(pg+1)*per).forEach((e,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const x0=M+col*(cw+gapX), yTop=H-top-row*(ch+gapY);
      c+=textOps(fitText(`${e.title}${e.codes?"   "+e.codes:""}`,7.5,cw),x0,yTop-9,7.5,{gray:0.25});
      const [vx,vy,vw,vh]=trialGeometry({...e.trial,order:null}).viewBox;
      const cx=x0+cw/2, cy=yTop-titleH-(ch-titleH)/2;
      const map=([x,y])=>[cx+k*(x-(vx+vw/2)),cy-k*(y-(vy+vh/2))];
      c+=questionOps(e.trial,map,k);
    });
    // footer: scale note and a bar showing 10 mm of the on-screen size
    const bar=10*pxPerMm*k;
    c+=`0.3 G 0.6 w ${n(M)} 34 m ${n(M+bar)} 34 l S ${n(M)} 31 m ${n(M)} 37 l S ${n(M+bar)} 31 m ${n(M+bar)} 37 l S\n`;
    c+=textOps(`10 mm on screen${calibrated?"":" (uncalibrated: 96 dpi assumed)"}  ·  figures printed at ${pct}% of their on-screen size, all at one scale  ·  comparisons in canvas order`,M+bar+8,31.5,7,{gray:0.4});
    pages.push({w:W,h:H,content:c});
  }
  return buildPdf(pages,{title:`${canvas||"canvas"} — questions`});
}
