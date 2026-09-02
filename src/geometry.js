/* Pure geometry: shape parsing, vertex layout and SVG markup.
   No DOM, no state — everything here is unit-testable. */

export const BASE_R = 70;
export const Q_DX = 2.7, Q_DY = 2.0;   // question layout constants (× BASE_R × s)
export const DEFAULT_RATIO = 0.18;

/* ================= parser ================= */
export const NAMES = {
  triangle:{n:3}, square:{n:4,offset:45}, diamond:{n:4},
  pentagon:{n:5}, hexagon:{n:6}, heptagon:{n:7}, septagon:{n:7},
  octagon:{n:8}, nonagon:{n:9}, decagon:{n:10},
  hendecagon:{n:11}, dodecagon:{n:12},
  circle:{circle:true}, star:{star:5}
};
export function parseShape(txt){
  const t=txt.trim().toLowerCase();
  if(!t) return null;
  if(t==="none"||t==="-") return {none:true};
  if(NAMES[t]) return {...NAMES[t], name:t};
  const g=t.match(/^(\d+)(?:-?\s*gon)?$/);
  if(g){const n=parseInt(g[1]); if(n>=3&&n<=24) return {n,name:n+"-gon"};}
  const s=t.match(/^(\d+)-?\s*(?:point(?:ed)?\s*)?star$/)||t.match(/^star\s*(\d+)$/);
  if(s){const n=parseInt(s[1]); if(n>=4&&n<=12) return {star:n,name:n+"-star"};}
  return null;
}
export function parseShapeWithRot(txt){
  const m=txt.trim().match(/^(.*?)\s+(-?\d+)\s*°?$/);
  if(m){
    const p=parseShape(m[1]);
    if(p&&!p.none) return {shape:p, rot:norm(parseInt(m[2]))};
  }
  const p=parseShape(txt);
  return p?{shape:p, rot:null}:null;
}

/* ================= angles ================= */
export function norm(v){return ((Math.round(v)%360)+360)%360;}
/* shortest signed rotation taking `from` to `to`, in (-180, 180] */
export function signedDelta(from,to){return ((to-from+540)%360)-180;}

/* ================= geometry ================= */
export function polyPts(n,r,offset=0){
  const pts=[];const rot=(offset-90)*Math.PI/180;
  for(let i=0;i<n;i++){
    const a=rot+i*2*Math.PI/n;
    pts.push([r*Math.cos(a),r*Math.sin(a)]);
  }
  return pts;
}
export function starPts(n,r){
  const pts=[];const rot=-Math.PI/2;const r2=r*0.45;
  for(let i=0;i<2*n;i++){
    const a=rot+i*Math.PI/n;
    const rr=i%2===0?r:r2;
    pts.push([rr*Math.cos(a),rr*Math.sin(a)]);
  }
  return pts;
}
export function pathD(pts){return "M"+pts.map(p=>p[0].toFixed(2)+","+p[1].toFixed(2)).join("L")+"Z";}
export function rotPt(p,deg){
  const a=deg*Math.PI/180;
  return [p[0]*Math.cos(a)-p[1]*Math.sin(a), p[0]*Math.sin(a)+p[1]*Math.cos(a)];
}
export function baseVerts(def,r,baseRot){
  if(def.circle) return polyPts(6,r,baseRot);
  if(def.star) return starPts(def.star,r).filter((_,i)=>i%2===0).map(p=>rotPt(p,baseRot));
  return polyPts(def.n,r,(def.offset||0)+baseRot);
}
export function vertCount(def){
  if(def.circle)return 6;
  if(def.star)return def.star;
  return def.n;
}

/* Orientation of the sub-shape sitting on vertex v.
   screen frame: absolute orientation, independent of the vertex.
   vertex frame: points outward from the center (+anchorRot), so it
   co-rotates with the base configuration. */
export function anchorOrientation(v,frame,anchorRot){
  if(frame==="vertex") return Math.atan2(v[1],v[0])*180/Math.PI+90+anchorRot;
  return anchorRot;
}

/* Stimuli render strictly black on white: solid fill without sub-shapes,
   and with sub-shapes the configuration IS the sub-shapes (no outlines). */
export function shapeMarkup(def,r,anchor,frame,baseRot=0,anchorRot=0,anchorRatio=DEFAULT_RATIO){
  const out=[];
  const hasAnchors=anchor&&!anchor.none;
  if(!hasAnchors){
    if(def.circle){
      out.push(`<circle cx="0" cy="0" r="${r}" fill="#111"/>`);
    }else{
      const pts=def.star?starPts(def.star,r).map(p=>rotPt(p,baseRot))
                        :polyPts(def.n,r,(def.offset||0)+baseRot);
      out.push(`<path d="${pathD(pts)}" fill="#111"/>`);
    }
    return out.join("");
  }
  const sr=r*anchorRatio;
  const verts=baseVerts(def,r,baseRot);
  verts.forEach(v=>{
    const rot=anchorOrientation(v,frame,anchorRot);
    if(anchor.circle){
      out.push(`<circle cx="${v[0].toFixed(2)}" cy="${v[1].toFixed(2)}" r="${sr}" fill="#111"/>`);
    }else{
      const spts=anchor.star?starPts(anchor.star,sr):polyPts(anchor.n,sr,anchor.offset||0);
      out.push(`<path d="${pathD(spts)}" fill="#111" transform="translate(${v[0].toFixed(2)},${v[1].toFixed(2)}) rotate(${rot.toFixed(1)})"/>`);
    }
  });
  return out.join("");
}
