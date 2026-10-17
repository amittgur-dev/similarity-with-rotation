import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseShape, parseShapeWithRot, norm, signedDelta, polyPts, starPts, baseVerts,
  vertCount, anchorOrientation, shapeMarkup, NAMES
} from "../src/geometry.js";

const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test("parseShape: named shapes, n-gons, stars, none", ()=>{
  assert.deepEqual(parseShape("square"),{n:4,offset:45,name:"square"});
  assert.deepEqual(parseShape(" Diamond "),{n:4,name:"diamond"});
  assert.deepEqual(parseShape("7"),{n:7,name:"7-gon"});
  assert.deepEqual(parseShape("9-gon"),{n:9,name:"9-gon"});
  assert.deepEqual(parseShape("6 star"),{star:6,name:"6-star"});
  assert.deepEqual(parseShape("star 8"),{star:8,name:"8-star"});
  assert.deepEqual(parseShape("5-pointed star"),{star:5,name:"5-star"});
  assert.deepEqual(parseShape("none"),{none:true});
  assert.deepEqual(parseShape("-"),{none:true});
  assert.equal(parseShape(""),null);
  assert.equal(parseShape("blob"),null);
  assert.equal(parseShape("2"),null,"n-gon lower bound");
  assert.equal(parseShape("25"),null,"n-gon upper bound");
  assert.equal(parseShape("3 star"),null,"star lower bound");
  assert.equal(parseShape("13 star"),null,"star upper bound");
  assert.ok(Object.keys(NAMES).includes("dodecagon"));
});

test("parseShapeWithRot: trailing rotation, normalised", ()=>{
  assert.deepEqual(parseShapeWithRot("square 45"),{shape:{n:4,offset:45,name:"square"},rot:45});
  assert.deepEqual(parseShapeWithRot("square -30°"),{shape:{n:4,offset:45,name:"square"},rot:330});
  assert.deepEqual(parseShapeWithRot("hexagon"),{shape:{n:6,name:"hexagon"},rot:null});
  // a trailing number is always a rotation: "star 5" is a 5-point star turned 5°; use "5 star" for an n-star
  assert.deepEqual(parseShapeWithRot("star 5"),{shape:{star:5,name:"star"},rot:5});
  assert.deepEqual(parseShapeWithRot("6 star"),{shape:{star:6,name:"6-star"},rot:null});
  assert.equal(parseShapeWithRot("none 45"),null,"none cannot carry a rotation");
  assert.equal(parseShapeWithRot("nothing"),null);
});

test("norm wraps to [0,360) and rounds", ()=>{
  assert.equal(norm(0),0);
  assert.equal(norm(360),0);
  assert.equal(norm(-45),315);
  assert.equal(norm(725),5);
  assert.equal(norm(44.6),45);
});

test("signedDelta: shortest signed rotation in [-180,180)", ()=>{
  assert.equal(signedDelta(0,45),45);
  assert.equal(signedDelta(45,0),-45);
  assert.equal(signedDelta(350,10),20);
  assert.equal(signedDelta(10,350),-20);
  assert.equal(signedDelta(0,180),-180);
  assert.equal(signedDelta(0,179),179);
  assert.equal(signedDelta(0,181),-179);
  assert.equal(signedDelta(90,90),0);
});

test("polyPts: first vertex at top, counter-clockwise on screen, radius r", ()=>{
  const p=polyPts(4,10);
  close(p[0][0],0);close(p[0][1],-10);
  close(p[1][0],10);close(p[1][1],0);
  p.forEach(([x,y])=>close(Math.hypot(x,y),10));
  const sq=polyPts(4,10,45);
  close(sq[0][0],10*Math.SQRT1_2);close(sq[0][1],-10*Math.SQRT1_2);
});

test("starPts alternates outer/inner radius", ()=>{
  const s=starPts(5,10);
  assert.equal(s.length,10);
  close(Math.hypot(...s[0]),10);
  close(Math.hypot(...s[1]),4.5);
});

test("baseVerts / vertCount: circle → 6 vertices, star → outer points", ()=>{
  assert.equal(baseVerts({circle:true},10,0).length,6);
  assert.equal(vertCount({circle:true}),6);
  assert.equal(baseVerts({star:7},10,0).length,7);
  assert.equal(vertCount({star:7}),7);
  assert.equal(vertCount({n:5}),5);
  // named square has offset 45 (flat top); orient 45 more puts the first vertex on the right
  const rotated=baseVerts({n:4,offset:45},10,45);
  close(rotated[0][0],10);close(rotated[0][1],0);
  const diamond=baseVerts({n:4},10,0);
  close(diamond[0][0],0);close(diamond[0][1],-10);
});

test("frame semantics: screen frame keeps absolute sub-shape orientation", ()=>{
  for(const v of [[0,-10],[10,0],[-7,7]]){
    assert.equal(anchorOrientation(v,"screen",30),30);
  }
});

test("frame semantics: vertex frame points outward and co-rotates with the base", ()=>{
  close(anchorOrientation([0,-10],"vertex",0),0,1e-9);   // top vertex → up
  close(anchorOrientation([10,0],"vertex",0),90);         // right vertex → right
  close(anchorOrientation([0,10],"vertex",0),180);        // bottom vertex → down
  close(anchorOrientation([10,0],"vertex",15),105);       // anchorRot adds on top
  // rotating the base by 90° rotates every sub-shape by 90°
  const before=baseVerts({n:4},10,0).map(v=>anchorOrientation(v,"vertex",0));
  const after=baseVerts({n:4},10,90).map(v=>anchorOrientation(v,"vertex",0));
  before.forEach((a,i)=>close(norm(after[i]-a),90));
});

test("shapeMarkup: solid fill without sub-shapes, sub-shapes only otherwise", ()=>{
  const solid=shapeMarkup({n:4,offset:45},70,{none:true},"screen",0,0);
  assert.match(solid,/^<path d="M[^"]+" fill="#111"\/>$/);
  const circ=shapeMarkup({circle:true},70,null,"screen");
  assert.equal(circ,'<circle cx="0" cy="0" r="70" fill="#111"/>');
  const sub=shapeMarkup({n:6},70,{n:3,name:"triangle"},"screen",0,0,0.18);
  assert.equal((sub.match(/<path/g)||[]).length,6,"one sub-shape per vertex");
  assert.ok(!sub.includes("stroke"),"no outlines, ever");
  assert.ok(sub.includes(`translate(0.00,-70.00) rotate(0.0)`));
  const circSub=shapeMarkup({n:3},70,{circle:true},"vertex",0,0,0.5);
  assert.equal((circSub.match(/<circle/g)||[]).length,3);
  assert.ok(circSub.includes('r="35"'),"sub-shape radius = r × ratio");
});

test("shapeMarkup: screen vs vertex frame differ only in sub-shape rotation", ()=>{
  const screen=shapeMarkup({n:4},70,{n:4,offset:45,name:"square"},"screen",0,20);
  const vertex=shapeMarkup({n:4},70,{n:4,offset:45,name:"square"},"vertex",0,20);
  const rots=s=>[...s.matchAll(/rotate\(([-\d.]+)\)/g)].map(m=>parseFloat(m[1]));
  assert.deepEqual(rots(screen),[20,20,20,20]);
  assert.deepEqual(rots(vertex),[20,110,200,290]);
  assert.equal(screen.replace(/rotate\([^)]*\)/g,""),vertex.replace(/rotate\([^)]*\)/g,""));
});

import { texturePoints, minTexture, defaultTexture, textureRatio, textureSpacing, subCount, clampTexture, relinkTexture, textureSpan, FILL_MAX } from "../src/geometry.js";

const key=p=>p.map(v=>v.toFixed(6)).join(",");
test("texture: the contour is explicit — corners and straight rows along every edge", ()=>{
  const sq=parseShape("square");
  const p=texturePoints(sq,70,4,0);
  assert.equal(p.length,16,"4 per side in a square is a 4 × 4 grid");
  const half=70/Math.SQRT2, set=new Set(p.map(key));
  for(const c of [[half,half],[-half,half],[half,-half],[-half,-half]])assert.ok(set.has(key(c)),"every corner holds an element");
  assert.equal(new Set(p.map(q=>q[0].toFixed(6))).size,4,"four straight columns");
  // triangles: exact triangular arrangements, 1+2+…+n elements, n on the base
  const tri=parseShape("triangle");
  for(const n of [3,4,5,7]){
    const t=texturePoints(tri,70,n);
    assert.equal(t.length,n*(n+1)/2,`triangle ${n}: triangular number`);
    const baseY=Math.max(...t.map(q=>q[1]));
    assert.equal(t.filter(q=>Math.abs(q[1]-baseY)<1e-6).length,n,"n elements on the base");
  }
  // hexagons: centred hexagonal numbers (the triangular lattice fills them exactly)
  assert.equal(texturePoints(parseShape("hexagon"),70,3).length,19);
  assert.equal(texturePoints(parseShape("hexagon"),70,4).length,37);
  assert.equal(texturePoints(parseShape("diamond"),70,4).length,16,"a diamond is a turned square grid");
  // a circle: an even rim plus the inside
  const circ=texturePoints(parseShape("circle"),70,6);
  assert.ok(circ.every(([x,y])=>Math.hypot(x,y)<=70+1e-9));
  assert.ok(circ.filter(([x,y])=>Math.abs(Math.hypot(x,y)-70)<1e-6).length>=12);
  // turning keeps the count
  assert.equal(texturePoints(tri,70,5,60).length,15);
  assert.equal(subCount(sq,4),16);assert.equal(subCount(sq,0),4);
  assert.equal(clampTexture(1),2);assert.equal(clampTexture(99),16);assert.equal(clampTexture("x"),4);
});

test("texture: frames keep their meaning (panels a–d)", ()=>{
  const sq=parseShape("square");
  const rots=m=>[...m.matchAll(/rotate\(([-\d.]+)\)/g)].map(x=>+x[1]);
  assert.ok(rots(shapeMarkup(sq,70,sq,"screen",45,0,0.12,4)).every(r=>r===0),"d: the lattice turns, the elements do not");
  assert.ok(rots(shapeMarkup(sq,70,sq,"vertex",45,0,0.12,4)).every(r=>r===45),"c: the elements co-rotate");
  assert.ok(rots(shapeMarkup(sq,70,sq,"screen",0,45,0.12,4)).every(r=>r===45),"b: only the elements turn");
  assert.equal((shapeMarkup(sq,70,sq,"screen",0,0,0.12,4).match(/<path/g)||[]).length,16);
  assert.equal(shapeMarkup(sq,70,sq,"screen",0,0,0.18,0),shapeMarkup(sq,70,sq,"screen",0,0,0.18),"texture 0 is the vertex arrangement, unchanged");
});

test("texture: minimum and default density are set by the clarity of the shape", ()=>{
  for(const s of ["triangle","square","hexagon","pentagon","5 star"])assert.equal(minTexture(parseShape(s)),3,`${s}: three per side make a straight edge`);
  const c=minTexture(parseShape("circle"));
  assert.ok(texturePoints(parseShape("circle"),1,c).filter(([x,y])=>Math.abs(Math.hypot(x,y)-1)<1e-9).length>=12,"a circle needs 12 on its rim");
  assert.equal(defaultTexture(parseShape("square")),4);
  assert.equal(defaultTexture(parseShape("triangle")),5,"a triangle starts at 15 elements");
  close(textureRatio(parseShape("square"),7),textureRatio(parseShape("square"),4)/2,1e-3);   // spacing halves from 4 to 7 per side
});

test("density, size and fill: hold one, change another, the third follows", ()=>{
  const sq=parseShape("square"), L=textureSpan(sq);
  close(textureSpacing(sq,4),L/3,1e-12);
  const start={n:4,size:textureRatio(sq,4)};                     // fill 0.3
  let r=relinkTexture(sq,start,"fill","density",7);              // hold fill: more, smaller
  assert.equal(r.n,7);close(r.size,start.size/2,1e-3);close(r.fill,0.3,1e-2);
  r=relinkTexture(sq,start,"size","density",5);                  // hold size: packed closer
  assert.equal(r.n,5);assert.equal(r.size,start.size);close(r.fill,start.size*4/L,1e-9);
  r=relinkTexture(sq,start,"size","density",16);                 // …until they would overlap
  assert.ok(r.fill<=FILL_MAX+1e-9);assert.equal(r.limited,"overlap");
  r=relinkTexture(sq,start,"density","size",start.size*1.2);     // hold density: smaller gaps
  assert.equal(r.n,4);close(r.fill,0.36,1e-2);
  r=relinkTexture(sq,start,"density","size",0.6);
  close(r.fill,FILL_MAX,1e-3);assert.equal(r.limited,"overlap");
  r=relinkTexture(sq,{n:7,size:textureRatio(sq,7)},"fill","size",textureRatio(sq,7)*2);   // hold fill: bigger, fewer
  assert.equal(r.n,4);
  r=relinkTexture(sq,start,"fill","size",0.55);
  assert.equal(r.n,3);assert.equal(r.limited,"contour");
  r=relinkTexture(sq,start,"fill","density",2);
  assert.equal(r.n,3);assert.equal(r.limited,"contour");
  r=relinkTexture(sq,{n:4,size:textureRatio(sq,4)},"size","fill",0.4);   // hold size: tighter fill packs more in
  assert.equal(r.n,5);
});

test("up- and down-pointing triangles are distinct shapes, both at 0°", ()=>{
  assert.deepEqual(parseShape("down triangle"),{n:3,offset:180,name:"down-triangle"});
  assert.deepEqual(parseShape("Down-Triangle"),{n:3,offset:180,name:"down-triangle"});
  assert.deepEqual(parseShape("▼"),{n:3,offset:180,name:"down-triangle"});
  assert.deepEqual(parseShape("upward  triangle"),{n:3,name:"up-triangle"});
  assert.deepEqual(parseShape("triangle"),{n:3,name:"triangle"},"plain triangle unchanged (points up)");
  assert.deepEqual(parseShapeWithRot("down triangle 30"),{shape:{n:3,offset:180,name:"down-triangle"},rot:30});
  const r=70, down=baseVerts(parseShape("down triangle"),r,0), up=baseVerts(parseShape("up triangle"),r,0);
  assert.ok(Math.abs(Math.max(...down.map(p=>p[1]))-r)<1e-9&&down.some(p=>Math.abs(p[0])<1e-9&&p[1]>0),"down: a tip at the bottom");
  assert.ok(up.some(p=>Math.abs(p[0])<1e-9&&p[1]<0),"up: a tip at the top");
  // textures: an exact triangular arrangement, the full row on top
  for(const n of [3,5,7]){
    const t=texturePoints(parseShape("down triangle"),r,n);
    assert.equal(t.length,n*(n+1)/2);
    const topY=Math.min(...t.map(q=>q[1]));
    assert.equal(t.filter(q=>Math.abs(q[1]-topY)<1e-6).length,n);
  }
});

import { figureExtent, questionLayout, questionStep, GAP_FIGURE, GAP_GROUPING, primitivesBBox, shapePrimitives } from "../src/geometry.js";

test("presentation layout: equal distances, gaps scaled to the figures, rotation-proof", ()=>{
  const P=s=>parseShape(s), m=(b,s,ratio=0.18,texture=0)=>({def:P(b),anchor:s==="none"?{none:true}:P(s),ratio,texture});
  // solid figures: the gap is one diameter
  let L=questionLayout([m("hexagon","none"),m("hexagon","none"),m("hexagon","none")],1);
  close(L.radius,70);close(L.gap,GAP_FIGURE*140);close(L.D,280);
  // a sparse triangle of small diamonds: its corners are far apart, so the grouping rule sets the gap
  L=questionLayout([m("triangle","diamond",0.1),m("triangle","diamond",0.1),m("triangle","diamond",0.1)],1);
  const side=Math.sqrt(3)*70;
  close(L.gap,GAP_GROUPING*side,1e-9);assert.ok(L.gap>2*L.radius);
  // the scale scales everything, the figures keep their size
  const L1=questionLayout([m("square","diamond"),m("square","diamond"),m("square","diamond")],1);
  const L2=questionLayout([m("square","diamond"),m("square","diamond"),m("square","diamond")],2);
  close(L2.D,2*L1.D);close(L2.radius,2*L1.radius);
  // two comparisons: equilateral; three: an arc around A, neighbours D apart
  const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const [A,B,C]=L1.positions;close(d(A,B),L1.D);close(d(A,C),L1.D);close(d(B,C),L1.D);
  const L4=questionLayout([0,1,2,3].map(()=>m("square","diamond")),1), Q=L4.positions;
  for(const k of [1,2,3])close(d(Q[0],Q[k]),L4.D);
  close(d(Q[1],Q[2]),L4.D);close(d(Q[2],Q[3]),L4.D);
  // textures: dense elements, the diameter rule applies; extents bound every orientation
  const e=figureExtent(P("square"),P("square"),0.1,6);
  assert.ok(e.spacing<0.5&&e.radius>1);
  for(const rot of [0,17,45,90]){
    const bb=primitivesBBox(shapePrimitives(P("square"),70,P("square"),"screen",rot,rot,0.1,6));
    assert.ok(Math.max(Math.abs(bb.x0),Math.abs(bb.x1),Math.abs(bb.y0),Math.abs(bb.y1))<=e.radius*70+1e-9,`rotation ${rot}: inside the radius bound`);
  }
  assert.ok(questionStep(L1)>L1.bounds.x1-L1.bounds.x0,"the next question starts beyond this one");
});

import { crossPts, densityForCount, CROSS_W, rotPt } from "../src/geometry.js";
test("plus and x: two perpendicular lines; the x is the plus turned 45°", ()=>{
  assert.deepEqual(parseShape("plus"),{cross:true,name:"plus"});
  assert.deepEqual(parseShape("X"),{cross:true,offset:45,name:"x"});
  for(const t of ["+","cross","✚"])assert.equal(parseShape(t).name,"plus",t);
  for(const t of ["ex","×","times","diagonal cross"])assert.equal(parseShape(t).name,"x",t);
  assert.deepEqual(parseShapeWithRot("x 30"),{shape:{cross:true,offset:45,name:"x"},rot:30});
  const plus=parseShape("plus"), x=parseShape("x");
  // solid: twelve corners, tips at r, arms CROSS_W r to either side of the line
  const pp=crossPts(70);
  assert.equal(pp.length,12);
  close(Math.max(...pp.map(([px,py])=>Math.hypot(px,py))),Math.hypot(70,70*CROSS_W));
  assert.equal(pp.filter(([px,py])=>Math.abs(py+70)<1e-9).length,2,"the top arm ends in two corners");
  const xp=crossPts(70,45);
  pp.forEach((p,i)=>{const q=rotPt(p,45);close(q[0],xp[i][0]);close(q[1],xp[i][1]);});
  assert.equal(shapeMarkup(x,70,{none:true},"screen",0,0),shapeMarkup(plus,70,{none:true},"screen",45,0),"solid x = solid plus at 45°");
  // on vertices: the centre and the four tips
  const v=baseVerts(plus,70,0);
  assert.equal(v.length,5);assert.equal(vertCount(plus),5);
  assert.deepEqual(v[0],[0,0]);
  for(const [tx,ty] of v.slice(1)){close(Math.hypot(tx,ty),70);assert.ok(Math.abs(tx)<1e-9||Math.abs(ty)<1e-9,"plus tips on the axes");}
  for(const [tx,ty] of baseVerts(x,70,0).slice(1))close(Math.abs(tx),Math.abs(ty));
  // texture: elements along the lines, 4n − 3 of them, the centre shared, the tips at r
  for(const n of [2,3,4,5,8,16]){
    const t=texturePoints(plus,70,n,0,true);
    assert.equal(t.length,4*n-3,`density ${n}`);assert.equal(subCount(plus,n,true),4*n-3);
    assert.ok(t.every(([px,py])=>Math.abs(px)<1e-9||Math.abs(py)<1e-9),"all on the two lines");
    assert.equal(t.filter(([px,py])=>Math.abs(Math.hypot(px,py)-70)<1e-9).length,4,"four tips");
    close(textureSpacing(plus,n)*70,70/(n-1));
  }
  assert.ok(texturePoints(x,70,5,0,true).every(([px,py])=>Math.abs(Math.abs(px)-Math.abs(py))<1e-9),"the x's elements on the diagonals");
  assert.equal(texturePoints(x,70,5,20,true).length,17,"turning keeps the count");
  assert.equal(minTexture(plus),2,"five elements: the centre and the tips");
  assert.equal(defaultTexture(plus,true),5,"17 elements by default");
  assert.equal(subCount(x,0),5);assert.equal(subCount(x,4,true),13);
  // asking for a number of elements gives the nearest the lines allow
  for(const [want,n] of [[15,5],[12,4],[20,6],[3,2],[100,16],[13,4],[17,5]])assert.equal(densityForCount(plus,want,true),n,`${want} elements → density ${n}`);
  // the full texture fills the bars: rows to either side of each line, nearest to the solid bar's width
  assert.equal(texturePoints(plus,70,5).length,45,"5 per arm: three rows, 9 × 9 less the four 3 × 3 corners");
  assert.equal(texturePoints(plus,70,9).length,145,"9 per arm: five rows");
  assert.equal(texturePoints(plus,70,3).length,9,"3 per arm: a single row still");
  const full=texturePoints(plus,70,5), lines=texturePoints(plus,70,5,0,true);
  assert.ok(lines.every(l=>full.some(f=>Math.hypot(f[0]-l[0],f[1]-l[1])<1e-9)),"the full texture contains the contour one");
  assert.ok(full.every(([px,py])=>Math.min(Math.abs(px),Math.abs(py))<=70*CROSS_W+1e-9),"within the solid bars");
  const xf=texturePoints(x,70,5), pf45=texturePoints(plus,70,5,45);
  xf.forEach((p,i)=>{close(p[0],pf45[i][0]);close(p[1],pf45[i][1]);});
  assert.equal(densityForCount(plus,17,false),3,"17 elements in full: 9 is nearer than 33");
  assert.equal(defaultTexture(plus,false),4,"33 elements by default when full");
  // frames: in the vertex frame the elements of an x sit at 45°, of a plus at 0°; the centre element follows too
  const sq=parseShape("square"), rots=m=>[...m.matchAll(/rotate\(([-\d.]+)\)/g)].map(r=>+r[1]);
  assert.ok(rots(shapeMarkup(x,70,sq,"vertex",0,0,0.1,4,true)).every(r=>r===45));
  assert.ok(rots(shapeMarkup(plus,70,sq,"vertex",0,0,0.1,4)).every(r=>r===0));
  assert.ok(rots(shapeMarkup(x,70,sq,"screen",0,10,0.1,4)).every(r=>r===10),"screen frame: absolute orientation");
  assert.deepEqual(rots(shapeMarkup(x,70,sq,"vertex",0,0,0.18,0)).map(r=>norm(r)),[45,45,135,225,315],"on vertices: the centre with the lines, the tips outward");
  const a=shapePrimitives(x,70,sq,"vertex",0,0,0.1,4,true), b=shapePrimitives(plus,70,sq,"vertex",45,0,0.1,4,true);
  a.forEach((p,i)=>{close(p.at[0],b[i].at[0]);close(p.at[1],b[i].at[1]);assert.equal(p.rot,b[i].rot);});
  // the texture controls: the contour minimum is two per arm; a plus as the sub-shape of something is fine
  assert.equal(relinkTexture(plus,{n:5,size:textureRatio(plus,5)},"fill","density",1).n,2);
  assert.equal(relinkTexture(plus,{n:5,size:textureRatio(plus,5)},"fill","density",1).limited,"contour");
  assert.equal((shapeMarkup(sq,70,plus,"screen",0,0,0.18,0).match(/<path/g)||[]).length,4,"a square of pluses");
  const e=figureExtent(plus,sq,0.1,5,true);
  close(e.radius,1.1);close(e.spacing,0.25);
});

test("contour textures: the outline only, nothing inside", ()=>{
  const sq=parseShape("square"), tri=parseShape("triangle"), circ=parseShape("circle"), hex=parseShape("hexagon");
  for(const n of [3,4,5,8])assert.equal(texturePoints(sq,70,n,0,true).length,4*(n-1),`square ${n}: a ring`);
  const half=70/Math.SQRT2;
  assert.ok(texturePoints(sq,70,4,0,true).every(([px,py])=>Math.abs(Math.max(Math.abs(px),Math.abs(py))-half)<1e-6),"every element on the square's outline");
  assert.equal(texturePoints(tri,70,5,0,true).length,12);
  assert.equal(texturePoints(hex,70,4,0,true).length,18);
  const ring=texturePoints(circ,70,6,0,true);
  assert.ok(ring.every(([px,py])=>Math.abs(Math.hypot(px,py)-70)<1e-6),"a circle: its rim");
  assert.ok(ring.length<texturePoints(circ,70,6).length);
  const full=texturePoints(sq,70,5), ring5=texturePoints(sq,70,5,0,true);
  assert.ok(ring5.every(c=>full.some(f=>Math.hypot(f[0]-c[0],f[1]-c[1])<1e-9)),"the contour is the full texture's outline row");
  assert.equal(texturePoints(sq,70,5,30,true).length,16,"turning keeps the count");
  assert.equal(defaultTexture(sq,true),5,"a contour square starts at 16 elements");
  assert.equal(defaultTexture(tri,true),6,"a contour triangle at 15");
  assert.equal(defaultTexture(sq),4,"the full texture is unchanged");
  assert.equal(densityForCount(sq,15,true),5);assert.equal(densityForCount(sq,10,true),4);
  assert.equal(subCount(sq,4,true),12);assert.equal(subCount(sq,4),16);
  assert.equal((shapeMarkup(sq,70,sq,"screen",0,0,0.12,4,true).match(/<path/g)||[]).length,12);
  assert.equal(shapeMarkup(sq,70,sq,"screen",0,0,0.12,4,false),shapeMarkup(sq,70,sq,"screen",0,0,0.12,4),"full is the default");
  const e=figureExtent(sq,sq,0.1,4,true), f=figureExtent(sq,sq,0.1,4);
  close(e.radius,f.radius);close(e.spacing,f.spacing);
});
