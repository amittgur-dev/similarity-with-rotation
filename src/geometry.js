/* Pure geometry: shape parsing, vertex layout and SVG markup.
   No DOM, no state — everything here is unit-testable. */

export const BASE_R = 70;
export const DEFAULT_RATIO = 0.18;
export const LABEL_GAP = 1.55;   // A/B/C label distance below an object centre, × BASE_R × scale (canvas, runs, exports)

/* ================= parser ================= */
export const NAMES = {
  triangle:{n:3}, square:{n:4,offset:45}, diamond:{n:4},
  "up-triangle":{n:3}, "down-triangle":{n:3,offset:180},   // distinct shapes: pointing up / standing on a tip, both at 0°
  pentagon:{n:5}, hexagon:{n:6}, heptagon:{n:7}, septagon:{n:7},
  octagon:{n:8}, nonagon:{n:9}, decagon:{n:10},
  hendecagon:{n:11}, dodecagon:{n:12},
  circle:{circle:true}, star:{star:5}
};
/* other ways of writing the two directed triangles */
const ALIASES={
  "up triangle":"up-triangle","upward triangle":"up-triangle","triangle up":"up-triangle","upward-triangle":"up-triangle","uptriangle":"up-triangle","▲":"up-triangle","△":"up-triangle",
  "down triangle":"down-triangle","downward triangle":"down-triangle","triangle down":"down-triangle","downward-triangle":"down-triangle","downtriangle":"down-triangle","▼":"down-triangle","▽":"down-triangle"
};
export function parseShape(txt){
  let t=txt.trim().toLowerCase().replace(/\s+/g," ");
  if(!t) return null;
  if(t==="none"||t==="-") return {none:true};
  t=ALIASES[t]||t;
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

/* ---- texture: sub-shapes filling the base shape ----
   Laid out for the clarity of the overall shape:
   1. the contour is drawn explicitly — elements evenly spaced along every
      edge with one on each corner (a circle: evenly around its rim), so
      every edge is a straight row of elements;
   2. the inside is a lattice that follows the shape's own symmetry — a
      square lattice for four-sided shapes, a triangular lattice for all
      others — aligned with the edge nearest the horizontal and anchored on
      a corner. Triangles, squares, diamonds and hexagons thereby come out
      as exact triangular / square / hexagonal arrangements; for the other
      shapes the lattice fills the inside and stops short of the contour
      row, which keeps the outline crisp.
   Density `n` = elements per side (a circle: across its diameter), so the
   spacing is side length / (n − 1). The whole layout turns with baseRot. */
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
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)odd=!odd;
  }
  return odd;
}
function distToOutline(pts,x,y,r){
  if(!pts)return r-Math.hypot(x,y);
  let d=Infinity;
  for(let i=0;i<pts.length;i++){
    const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length];
    const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));
    d=Math.min(d,Math.hypot(x-x1-t*dx,y-y1-t*dy));
  }
  return d;
}
/* the length that density counts elements along, at r = 1: a side, or a circle's diameter */
export function textureSpan(def){
  const pts=outline(def,1);
  if(!pts)return 2;
  return Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1]);
}
export const textureSpacing=(def,n)=>textureSpan(def)/(clampTexture(n)-1);
const INNER_GAP=0.85;   // lattice points closer than this × spacing to the contour are left to the contour row
export function texturePoints(def,r,n,baseRot=0){
  n=clampTexture(n);
  const s=textureSpacing(def,n)*r, pts=outline(def,r), out=[];
  // 1. contour
  if(!pts){
    const m=Math.max(6,Math.round(2*Math.PI*r/s));
    for(let i=0;i<m;i++){const a=(-90+i*360/m)*Math.PI/180;out.push([r*Math.cos(a),r*Math.sin(a)]);}
  }else{
    pts.forEach((p,i)=>{
      const q=pts[(i+1)%pts.length], k=Math.max(1,Math.round(Math.hypot(q[0]-p[0],q[1]-p[1])/s));
      for(let j=0;j<k;j++)out.push([p[0]+(q[0]-p[0])*j/k,p[1]+(q[1]-p[1])*j/k]);
    });
  }
  // 2. inside: lattice aligned with the edge nearest the horizontal, anchored on its corner
  let theta=0, origin=[0,0];
  if(pts&&!def.star){
    let best=Infinity;
    pts.forEach((p,i)=>{
      const q=pts[(i+1)%pts.length];
      let a=Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;
      a=((a%180)+180)%180;if(a>90)a-=180;
      if(Math.abs(a)<best-1e-9){best=Math.abs(a);theta=a;origin=p;}
    });
  }
  const square=def.n===4;
  const t=theta*Math.PI/180, c=Math.cos(t), sn=Math.sin(t);
  const u=[s*c,s*sn], v=square?[-s*sn,s*c]:[s*(0.5*c-Math.sqrt(3)/2*sn),s*(0.5*sn+Math.sqrt(3)/2*c)];
  const K=Math.ceil(4*r/s)+2;
  for(let i=-K;i<=K;i++)for(let j=-K;j<=K;j++){
    const x=origin[0]+i*u[0]+j*v[0], y=origin[1]+i*u[1]+j*v[1];
    if(Math.abs(x)>r+1e-9||Math.abs(y)>r+1e-9)continue;
    if(inside(pts,x,y,r,0)&&distToOutline(pts,x,y,r)>=INNER_GAP*s-1e-9)out.push([x,y]);
  }
  return baseRot?out.map(p=>rotPt(p,baseRot)):out;
}

/* ---- density, element size and fill are linked ----
   size (sub-shape relative size) = fill × spacing, and the spacing is
   side / (density − 1). Fill is the element's radius over the spacing
   (0.45: elements of any orientation stay clear of each other). Two of
   the three determine the third, so one of them is held: changing another
   moves the remaining one. Density never drops below the contour minimum
   and fill stays within FILL_MIN..FILL_MAX, so a change can be limited;
   `limited` then says by what. */
export const TEXTURE_FILL=0.3;   // default element radius as a share of the spacing
export const FILL_MIN=0.08, FILL_MAX=0.45;
export function textureRatio(def,n,fill=TEXTURE_FILL){
  return +(Math.max(0.02,Math.min(0.6,fill*textureSpacing(def,n)))).toFixed(4);
}
export function relinkTexture(def,{n,size},hold,edited,value){
  const L=textureSpan(def), nMin=minTexture(def), nMax=16;
  const clampN=v=>Math.max(nMin,Math.min(nMax,Math.round(v)));
  const fillOf=(sz,k)=>sz*(k-1)/L;          // radius / spacing
  const nFor=(f,sz)=>f*L/sz+1;              // density giving fill f at size sz
  let limited="";
  let fill=fillOf(size,n);
  if(edited==="density"){
    const want=Math.round(value);
    n=clampN(want);
    if(want<nMin)limited="contour";
    if(hold==="size"){
      const cap=Math.floor(nFor(FILL_MAX,size)), floor=Math.ceil(nFor(FILL_MIN,size));
      if(n>cap){n=Math.max(nMin,cap);limited="overlap";}
      if(n<floor){n=Math.min(nMax,floor);limited="sparse";}
      if(fillOf(size,n)>FILL_MAX){size=FILL_MAX*L/(n-1);limited="overlap";}
    }else size=fill*L/(n-1);                                  // hold fill: more elements, smaller ones
  }else if(edited==="size"){
    size=value;
    if(hold==="density"){
      const hi=FILL_MAX*L/(n-1), lo=FILL_MIN*L/(n-1);
      if(size>hi){size=hi;limited="overlap";}
      if(size<lo){size=lo;limited="sparse";}
    }else{                                                    // hold fill: larger elements, fewer of them
      const want=nFor(fill,size);
      n=clampN(want);
      if(want<nMin-0.5)limited="contour";
      if(want>nMax+0.5)limited="max";
      size=Math.min(size,FILL_MAX*L/(n-1));
    }
  }else if(edited==="fill"){
    fill=Math.max(FILL_MIN,Math.min(FILL_MAX,value));
    if(value>FILL_MAX)limited="overlap";
    if(value<FILL_MIN)limited="sparse";
    if(hold==="density")size=fill*L/(n-1);
    else{                                                     // hold size: tighter fill packs more elements in
      const want=nFor(fill,size);
      n=clampN(want);
      if(want<nMin-0.5)limited="contour";
      if(want>nMax+0.5)limited="max";
    }
  }
  size=+Math.max(0.02,Math.min(0.6,size)).toFixed(4);
  return {n,size,fill:fillOf(size,n),limited};
}

/* The lowest density at which the elements carry the contour: three
   elements per side — two points are always collinear, it takes three to
   read as a straight edge — and for a circle at least 12 around the rim. */
export const MIN_PER_SIDE=3, MIN_RIM=12;
export function minTexture(def){
  if(def.circle){for(let n=3;n<=16;n++)if(Math.round(Math.PI*(n-1))>=MIN_RIM)return n;return 16;}
  return MIN_PER_SIDE;
}

/* the density a new texture starts at: the lowest (from 4, and not below
   the minimum) that gives at least DEFAULT_ELEMENTS elements — clear shape first */
export const DEFAULT_ELEMENTS=15;
export function defaultTexture(def){
  for(let n=Math.max(minTexture(def),DEFAULT_TEXTURE);n<=16;n++)if(texturePoints(def,1,n).length>=DEFAULT_ELEMENTS)return n;
  return 16;
}

/* how many sub-shapes a construction has */
export function subCount(def,texture=0){
  return texture?texturePoints(def,BASE_R,texture).length:vertCount(def);
}

/* ================= presenting a question =================
   One layout for the canvas, pilot runs, participant runs, the PDF and every
   stimulus export, so what is designed is exactly what is shown.

   1. Every comparison is the same distance D from the reference A: spatial
      distance itself changes similarity judgements (Casasanto 2008: in
      perceptual judgements, stimuli shown closer together were rated less
      similar), so no comparison may sit closer to A than another.
      · two comparisons: A, B, C form an equilateral triangle (A on top)
      · three comparisons: B, C, D lie on an arc around A at −60°, 0°, +60°
        (three consecutive corners of a hexagon centred on A), so they are
        also D from their neighbours
   2. The empty gap between neighbouring figures is GAP_FIGURE figure
      diameters, so neighbours are always spaced by at least twice Bouma's
      critical spacing (half the eccentricity; Pelli & Tillman 2008) from
      whichever figure is fixated, and
   3. at least GAP_GROUPING × the largest spacing between elements inside a
      figure, so each figure's elements group with each other and not with a
      neighbour's (grouping by proximity follows relative distance; Kubovy,
      Holcombe & Wagemans 1998).
   4. Figures keep their size; the spacing scales with them. The extents are
      rotation-invariant bounds, so rotating members never moves them. */
export const GAP_FIGURE=1, GAP_GROUPING=1.5;
const extentCache=new Map();
/* a figure's extent at r = 1: radius bounds every orientation; spacing is
   the largest distance from an element to its nearest neighbour */
export function figureExtent(def,anchor,ratio=DEFAULT_RATIO,texture=0){
  const key=JSON.stringify([def,anchor,+ratio||DEFAULT_RATIO,texture||0]);
  if(extentCache.has(key))return extentCache.get(key);
  let out;
  if(!anchor||anchor.none)out={radius:1,spacing:0};
  else{
    const pts=texture?texturePoints(def,1,texture):baseVerts(def,1,0);
    const radius=Math.max(...pts.map(p=>Math.hypot(p[0],p[1])))+(+ratio||DEFAULT_RATIO);
    let spacing=0;
    for(let i=0;i<pts.length;i++){
      let nn=Infinity;
      for(let j=0;j<pts.length;j++)if(j!==i)nn=Math.min(nn,Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]));
      if(nn<Infinity)spacing=Math.max(spacing,nn);
    }
    out={radius,spacing};
  }
  extentCache.set(key,out);
  return out;
}
/* members: [{def, anchor, ratio, texture}] with A first, then 2 or 3
   comparisons; s: the question's scale. Positions are relative to the
   question centre (canvas pixels). */
export function questionLayout(members,s=1){
  const ext=members.map(m=>figureExtent(m.def,m.anchor,m.ratio,m.texture));
  const radius=Math.max(...ext.map(e=>e.radius))*BASE_R*s;
  const spacing=Math.max(...ext.map(e=>e.spacing))*BASE_R*s;
  const gap=Math.max(GAP_FIGURE*2*radius,GAP_GROUPING*spacing);
  const D=2*radius+gap;
  const positions=members.length>=4
    ?[[0,-D/2],[-D*Math.sqrt(3)/2,0],[0,D/2],[D*Math.sqrt(3)/2,0]]
    :[[0,-D*Math.sqrt(3)/4],[-D/2,D*Math.sqrt(3)/4],[D/2,D*Math.sqrt(3)/4]];
  const xs=positions.map(p=>p[0]), ys=positions.map(p=>p[1]);
  return {positions,D,gap,radius,
          bounds:{x0:Math.min(...xs)-radius,x1:Math.max(...xs)+radius,y0:Math.min(...ys)-radius,y1:Math.max(...ys)+radius}};
}
/* how far to the right the next question goes (group variations): the
   question's width plus one figure diameter of clear space */
export function questionStep(layout){
  return layout.bounds.x1-layout.bounds.x0+2*layout.radius;
}
/* exact bounding box of drawn primitives (for image exports) */
export function primitivesBBox(prims){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const add=(x,y)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);};
  for(const p of prims){
    if(p.circle){add(p.circle[0]-p.r,p.circle[1]-p.r);add(p.circle[0]+p.r,p.circle[1]+p.r);}
    else p.poly.forEach(q=>{const r=p.at?rotPt(q,p.rot):q;add(r[0]+(p.at?p.at[0]:0),r[1]+(p.at?p.at[1]:0));});
  }
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};
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
/* The drawing of one object as primitives, shared by the SVG renderer and
   the PDF export so the two cannot differ:
   {circle:[cx,cy], r} | {poly:[[x,y]…]} with an optional placement
   {at:[x,y], rot} (the polygon is drawn rotated by rot, then moved to at). */
export function shapePrimitives(def,r,anchor,frame,baseRot=0,anchorRot=0,anchorRatio=DEFAULT_RATIO,texture=0){
  const hasAnchors=anchor&&!anchor.none;
  if(!hasAnchors){
    if(def.circle)return [{circle:[0,0],r}];
    return [{poly:def.star?starPts(def.star,r).map(p=>rotPt(p,baseRot)):polyPts(def.n,r,(def.offset||0)+baseRot)}];
  }
  const sr=r*anchorRatio;
  const verts=texture?texturePoints(def,r,texture,baseRot):baseVerts(def,r,baseRot);
  const spts=anchor.circle?null:(anchor.star?starPts(anchor.star,sr):polyPts(anchor.n,sr,anchor.offset||0));
  return verts.map(v=>{
    const rot=texture?(frame==="vertex"?baseRot+anchorRot:anchorRot):anchorOrientation(v,frame,anchorRot);
    return anchor.circle?{circle:v,r:sr,sub:true}:{poly:spts,at:v,rot};
  });
}
export function shapeMarkup(def,r,anchor,frame,baseRot=0,anchorRot=0,anchorRatio=DEFAULT_RATIO,texture=0){
  return shapePrimitives(def,r,anchor,frame,baseRot,anchorRot,anchorRatio,texture).map(p=>{
    if(p.circle)return p.sub?`<circle cx="${p.circle[0].toFixed(2)}" cy="${p.circle[1].toFixed(2)}" r="${p.r}" fill="#111"/>`
                            :`<circle cx="0" cy="0" r="${p.r}" fill="#111"/>`;
    return p.at?`<path d="${pathD(p.poly)}" fill="#111" transform="translate(${p.at[0].toFixed(2)},${p.at[1].toFixed(2)}) rotate(${p.rot.toFixed(1)})"/>`
               :`<path d="${pathD(p.poly)}" fill="#111"/>`;
  }).join("");
}
