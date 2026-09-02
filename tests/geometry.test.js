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
