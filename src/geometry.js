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

/* ---- texture: sub-shapes tiling the inside of the base shape ----
   A square lattice, aligned with the screen axes at baseRot 0: the
   shape's width is divided into `n` cells, a sub-shape sits at the centre
   of every cell whose centre lies inside the outline, and the whole
   lattice turns with baseRot. For a square, n = 4 gives a 4 × 4 grid. */
export const DEFAULT_TEXTURE=4;
export const clampTexture=n=>Math.max(2,Math.min(16,Math.round(+n)||DEFAULT_TEXTURE));
function outline(def,r){
  if(def.circle)return null;
  return def.star?starPts(def.star,r):polyPts(def.n,r,def.offset||0);
}
function inside(pts,x,y,r,eps){
  if(!pts)return x*x+y*y<=(r+eps)*(r+eps);
  let odd=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const [xi,yi]=pts[i],[xj,yj]=pts[j];
    // on an edge counts as inside (the lattice corners of a square are its vertices)
    const cross=(xj-xi)*(y-yi)-(yj-yi)*(x-xi), len=Math.hypot(xj-xi,yj-yi);
    if(Math.abs(cross)<=eps*len&&x>=Math.min(xi,xj)-eps&&x<=Math.max(xi,xj)+eps&&y>=Math.min(yi,yj)-eps&&y<=Math.max(yi,yj)+eps)return true;
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)odd=!odd;
  }
  return odd;
}
export function texturePoints(def,r,n,baseRot=0){
  n=clampTexture(n);
  const pts=outline(def,r);
  const xs=pts?pts.map(p=>p[0]):[-r,r], ys=pts?pts.map(p=>p[1]):[-r,r];
  const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  const step=(x1-x0)/n, eps=r*1e-6;
  const rows=Math.max(1,Math.round((y1-y0)/step)), yStart=(y0+y1)/2-(rows-1)*step/2;
  const out=[];
  for(let j=0;j<rows;j++)for(let i=0;i<n;i++){
    const x=x0+(i+0.5)*step, y=yStart+j*step;
    if(inside(pts,x,y,r,eps))out.push(rotPt([x,y],baseRot));
  }
  return out;
}
/* Element size follows density: a textured sub-shape fills a fixed share
   of its lattice cell, so doubling the density halves the element size.
   Returned as a sub-shape relative size (fraction of the base radius),
   the same unit as for sub-shapes on the vertices. */
export const TEXTURE_FILL=0.35;   // sub-shape radius as a share of the cell width
export function textureRatio(def,n,fill=TEXTURE_FILL){
  const pts=outline(def,1), xs=pts?pts.map(p=>p[0]):[-1,1];
  const w=Math.max(...xs)-Math.min(...xs);
  return +(Math.max(0.02,Math.min(0.6,fill*w/clampTexture(n)))).toFixed(4);
}
/* ---- density, element size and fill are linked ----
   size (sub-shape relative size) = fill × cell width, and the cell width
   is the shape's width / density. Fill is the element's radius over the
   cell width (0.5: elements of any orientation just touch). Two of the
   three determine the third, so one of them is held: changing another
   moves the remaining one. Density never drops below the contour minimum
   and fill stays within FILL_MIN..FILL_MAX, so a change can be limited;
   `limited` then says by what. */
export const FILL_MIN=0.08, FILL_MAX=0.5;
export function textureWidth(def){
  const pts=outline(def,1);
  if(!pts)return 2;
  const xs=pts.map(p=>p[0]);
  return Math.max(...xs)-Math.min(...xs);
}
export function relinkTexture(def,{n,size},hold,edited,value){
  const w=textureWidth(def), nMin=minTexture(def), nMax=16;
  const clampN=v=>Math.max(nMin,Math.min(nMax,Math.round(v)));
  const fillOf=(sz,k)=>sz*k/w;
  let limited="";
  let fill=fillOf(size,n);
  if(edited==="density"){
    const want=Math.round(value);
    n=clampN(want);
    if(want<nMin)limited="contour";
    if(hold==="size"){
      const cap=Math.floor(FILL_MAX*w/size), floor=Math.ceil(FILL_MIN*w/size);
      if(n>cap){n=Math.max(nMin,cap);limited="overlap";}
      if(n<floor){n=Math.min(nMax,floor);limited="sparse";}
      if(fillOf(size,n)>FILL_MAX){size=FILL_MAX*w/n;limited="overlap";}
    }else size=fill*w/n;                                   // hold fill: more elements, smaller ones
  }else if(edited==="size"){
    size=value;
    if(hold==="density"){
      const hi=FILL_MAX*w/n, lo=FILL_MIN*w/n;
      if(size>hi){size=hi;limited="overlap";}
      if(size<lo){size=lo;limited="sparse";}
    }else{                                                  // hold fill: larger elements, fewer of them
      const want=fill*w/size;
      n=clampN(want);
      if(want<nMin-0.5)limited="contour";
      if(want>nMax+0.5)limited="max";
      size=Math.min(size,FILL_MAX*w/n);
    }
  }else if(edited==="fill"){
    fill=Math.max(FILL_MIN,Math.min(FILL_MAX,value));
    if(value>FILL_MAX)limited="overlap";
    if(value<FILL_MIN)limited="sparse";
    if(hold==="density")size=fill*w/n;
    else{                                                   // hold size: tighter fill packs more elements in
      const want=fill*w/size;
      n=clampN(want);
      if(want<nMin-0.5)limited="contour";
      if(want>nMax+0.5)limited="max";
    }
  }
  size=+Math.max(0.02,Math.min(0.6,size)).toFixed(4);
  return {n,size,fill:fillOf(size,n),limited};
}

/* The lowest density at which the elements still carry the contour.
   Contour fidelity: the silhouette of the texture (the lattice cells that
   hold an element) is compared with the true outline as intersection over
   union. The minimum is the first density reaching MIN_FIDELITY (stars,
   whose thin points a lattice can only approximate, need MIN_FIDELITY_STAR),
   with at least PER_CORNER elements per corner of the outline (a circle
   counts as eight corners, a star as twice its points) and never fewer than
   MIN_ELEMENTS. Below it a texture reads as a cluster of dots — a circle of
   3 × 3 is a square. */
export const MIN_FIDELITY=0.85, MIN_FIDELITY_STAR=0.78, MIN_ELEMENTS=9, PER_CORNER=3;
const corners=def=>def.circle?8:def.star?2*def.star:def.n;
export function contourFidelity(def,n,G=120){
  n=clampTexture(n);
  const pts=def.circle?polyPts(96,1):outline(def,1);
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  const step=(x1-x0)/n, rows=Math.max(1,Math.round((y1-y0)/step)), yStart=(y0+y1)/2-(rows-1)*step/2;
  const cells=new Set();
  for(let j=0;j<rows;j++)for(let i=0;i<n;i++)
    if(inside(def.circle?null:pts,x0+(i+0.5)*step,yStart+j*step,1,1e-6))cells.add(i+","+j);
  const lo=Math.min(x0,y0,yStart-step)-0.05, hi=Math.max(x1,y1,yStart+rows*step)+0.05;
  let I=0,U=0;
  for(let a=0;a<G;a++)for(let b=0;b<G;b++){
    const x=lo+(hi-lo)*(a+0.5)/G, y=lo+(hi-lo)*(b+0.5)/G;
    const inO=def.circle?x*x+y*y<=1:inside(pts,x,y,1,0);
    const inT=cells.has(Math.floor((x-x0)/step)+","+Math.round((y-yStart)/step));
    if(inO&&inT)I++;if(inO||inT)U++;
  }
  return U?I/U:0;
}
const minCache=new Map();
export function minTexture(def){
  const key=def.circle?"circle":def.star?"star"+def.star:`${def.n}:${def.offset||0}`;
  if(minCache.has(key))return minCache.get(key);
  const need=Math.max(MIN_ELEMENTS,PER_CORNER*corners(def)), fid=def.star?MIN_FIDELITY_STAR:MIN_FIDELITY;
  let m=16;
  for(let n=2;n<=16;n++){
    if(texturePoints(def,1,n).length>=need&&contourFidelity(def,n)>=fid){m=n;break;}
  }
  minCache.set(key,m);
  return m;
}

/* how many sub-shapes a construction has */
export function subCount(def,texture=0){
  return texture?texturePoints(def,BASE_R,texture).length:vertCount(def);
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
   and with sub-shapes the configuration IS the sub-shapes (no outlines).
   texture (sub-shapes per row, 0 = on the vertices) fills the shape with
   a lattice of sub-shapes instead. The frame keeps its meaning: screen,
   the elements hold their absolute orientation while the lattice turns;
   vertex, they co-rotate with it (orientation baseRot + anchorRot). */
export function shapeMarkup(def,r,anchor,frame,baseRot=0,anchorRot=0,anchorRatio=DEFAULT_RATIO,texture=0){
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
  const verts=texture?texturePoints(def,r,texture,baseRot):baseVerts(def,r,baseRot);
  verts.forEach(v=>{
    const rot=texture?(frame==="vertex"?baseRot+anchorRot:anchorRot):anchorOrientation(v,frame,anchorRot);
    if(anchor.circle){
      out.push(`<circle cx="${v[0].toFixed(2)}" cy="${v[1].toFixed(2)}" r="${sr}" fill="#111"/>`);
    }else{
      const spts=anchor.star?starPts(anchor.star,sr):polyPts(anchor.n,sr,anchor.offset||0);
      out.push(`<path d="${pathD(spts)}" fill="#111" transform="translate(${v[0].toFixed(2)},${v[1].toFixed(2)}) rotate(${rot.toFixed(1)})"/>`);
    }
  });
  return out.join("");
}
