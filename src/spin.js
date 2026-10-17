/* Continuous rotation: an object can turn on its own, in two independent
   ways that combine —
   · the shape's rotation: a signed speed in degrees per second (+ clockwise
     as seen on the screen) turning the whole figure (the sub-shapes come
     along) or the shape only (the sub-shapes keep their orientation);
   · the sub-shapes' own rotation: a signed speed turning them in place.
   The stored orientations never change; what is drawn is the design turned
   by the phases the clock has reached, so the frame keeps its meaning. */

export const SPIN_SCOPES=["whole","shape"];
export const SPIN_DEFAULT=30, SPIN_MIN=1, SPIN_MAX=720;
export const clampSpinSpeed=v=>Math.max(SPIN_MIN,Math.min(SPIN_MAX,Math.round(Math.abs(+v))||SPIN_DEFAULT));
const signed=v=>v?Math.sign(v)*clampSpinSpeed(v):0;
/* a valid spin record {dps, scope, sub}, or null when nothing turns.
   Earlier records had one speed and a scope of sub (the sub-shapes only)
   or opposite (the shape one way, the sub-shapes the other): mapped. */
export function normalizeSpin(s){
  if(!s)return null;
  let dps=+s.dps||0, scope=s.scope, sub=+s.sub||0;
  if(scope==="sub"){sub=sub||dps;dps=0;scope="whole";}
  else if(scope==="opposite"){sub=sub||-dps;scope="shape";}
  if(!SPIN_SCOPES.includes(scope))scope="whole";
  dps=signed(dps);sub=signed(sub);
  return dps||sub?{dps,scope,sub}:null;
}
const turned=(dps,ms)=>dps?((dps*ms/1000)%360+360)%360:0;
/* the phases (degrees) reached after ms milliseconds: the shape's and the sub-shapes' */
export const spinPhases=(spin,ms)=>({phase:turned(spin&&spin.dps,ms),sub:turned(spin&&spin.sub,ms)});
/* what to draw: the design orientations turned by the phases, by scope and frame.
   An element's absolute orientation is anchorRot in the screen frame and
   follows the configuration (+ anchorRot) in the vertex frame. */
export function spinAngles(p,phase,subPhase=0){
  let baseRot=p.baseRot, anchorRot=p.anchorRot;
  if(phase){
    const vertex=p.frame==="vertex", scope=(p.spin&&p.spin.scope)||"whole";
    baseRot+=phase;
    if(scope==="shape"){if(vertex)anchorRot-=phase;}   // the elements keep their orientation
    else if(!vertex)anchorRot+=phase;                   // everything together
  }
  anchorRot+=subPhase;                                  // the sub-shapes' own turning, in place
  return {baseRot,anchorRot};
}
export const SPIN_SCOPE_LABEL={whole:"the whole figure: the sub-shapes turn with it",shape:"the shape only: the sub-shapes keep their orientation"};
/* one line about one of the two rotations */
export function spinText(spin,kind="shape"){
  const s=normalizeSpin(spin), v=s?(kind==="sub"?s.sub:s.dps):0;
  if(!v)return "still";
  const secs=360/Math.abs(v);
  return `${v>0?"clockwise":"counter-clockwise"} · ${Math.abs(v)}°/s, a turn every ${secs>=10?Math.round(secs):+secs.toFixed(1)} s`+
         (kind==="sub"?" · the sub-shapes, in place":s.scope==="shape"?" · the shape only":" · the whole figure");
}
/* keeps spinning members turning inside an <svg> until the returned function is called:
   members [{selector, p}] where p carries def/anchor/frame/rotations/spin; draw(p, elapsedMs) → markup */
export function animateMembers(svg,members,draw,now0=performance.now()){
  let raf=0;
  const tick=now=>{
    raf=0;
    for(const m of members){const g=svg.querySelector(m.selector);if(g)g.innerHTML=draw(m.p,now-now0);}
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return ()=>{if(raf)cancelAnimationFrame(raf);raf=0;};
}
