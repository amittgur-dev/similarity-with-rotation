/* Continuous rotation: an object can turn on its own, at a signed speed in
   degrees per second (+ clockwise as seen on the screen), in one of four
   ways — the three of the rotational variants, whole / shape / sub-shapes,
   plus `opposite`: the configuration one way and the sub-shapes the other.
   The stored orientations never change; what is drawn is the design turned
   by the phase the clock has reached, so the frame keeps its meaning. */

export const SPIN_SCOPES=["whole","shape","sub","opposite"];
export const SPIN_DEFAULT=30, SPIN_MIN=1, SPIN_MAX=720;
export const clampSpinSpeed=v=>Math.max(SPIN_MIN,Math.min(SPIN_MAX,Math.round(Math.abs(+v))||SPIN_DEFAULT));
/* a valid spin record, or null when the object stands still */
export function normalizeSpin(s){
  if(!s||!+s.dps)return null;
  return {dps:Math.sign(+s.dps)*clampSpinSpeed(s.dps),scope:SPIN_SCOPES.includes(s.scope)?s.scope:"whole"};
}
/* the phase (degrees) reached after ms milliseconds */
export const spinPhase=(spin,ms)=>spin&&spin.dps?((spin.dps*ms/1000)%360+360)%360:0;
/* what to draw: the design orientations turned by the phase, by scope and frame.
   An element's absolute orientation is anchorRot in the screen frame and
   follows the configuration (+ anchorRot) in the vertex frame. */
export function spinAngles(p,phase){
  if(!phase)return {baseRot:p.baseRot,anchorRot:p.anchorRot};
  const scope=(p.spin&&p.spin.scope)||"whole", vertex=p.frame==="vertex";
  switch(scope){
    case "sub":      return {baseRot:p.baseRot,anchorRot:p.anchorRot+phase};                                  // elements turn in place
    case "shape":    return {baseRot:p.baseRot+phase,anchorRot:vertex?p.anchorRot-phase:p.anchorRot};       // elements keep their orientation
    case "opposite": return {baseRot:p.baseRot+phase,anchorRot:vertex?p.anchorRot-2*phase:p.anchorRot-phase}; // elements turn the other way
    default:         return {baseRot:p.baseRot+phase,anchorRot:vertex?p.anchorRot:p.anchorRot+phase};       // everything together
  }
}
export const SPIN_SCOPE_LABEL={whole:"everything together",shape:"the shape only",sub:"the sub-shapes only",opposite:"shape and sub-shapes in opposite directions"};
export function spinText(spin){
  const s=normalizeSpin(spin);
  if(!s)return "still";
  const secs=360/Math.abs(s.dps);
  return `${s.dps>0?"clockwise":"counter-clockwise"} · ${Math.abs(s.dps)}°/s, a turn every ${secs>=10?Math.round(secs):+secs.toFixed(1)} s · ${SPIN_SCOPE_LABEL[s.scope]}`;
}
/* keeps spinning members turning inside an <svg> until the returned function is called:
   members [{selector, p}] where p carries def/anchor/frame/rotations/spin; draw(p, phase) → markup */
export function animateMembers(svg,members,draw,now0=performance.now()){
  let raf=0;
  const tick=now=>{
    raf=0;
    for(const m of members){const g=svg.querySelector(m.selector);if(g)g.innerHTML=draw(m.p,spinPhase(m.p.spin,now-now0));}
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return ()=>{if(raf)cancelAnimationFrame(raf);raf=0;};
}
