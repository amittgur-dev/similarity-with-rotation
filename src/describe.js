/* "Describe the experiment you want": a natural-language request becomes a
   structured plan (shapes, questions as rotation triples, settings) via
   Claude, then the plan is materialised on the canvas. The API key never
   lives in the page: by default the request goes through the Supabase
   Edge Function (server/supabase/functions/describe), which holds the key
   and requires the experimenter to be signed in; optionally the
   experimenter's own key is used directly from the browser. */

export const AI_KEY="stimulus-builder.ai";   // {mode:"supabase"|"direct", apiKey?}
export const MODEL="claude-opus-5";

const SHAPE_NAMES=["triangle","square","diamond","pentagon","hexagon","heptagon","octagon","nonagon","decagon","circle","star"];

export const PLAN_SCHEMA={
  type:"object",
  additionalProperties:false,
  properties:{
    experiment:{type:"object",additionalProperties:false,properties:{
      name:{type:"string",description:"short experiment name, e.g. 'vertex vs screen frame'"},
      rationale:{type:"string",description:"one or two sentences on what the set manipulates"}},required:["name","rationale"]},
    shapes:{type:"array",description:"stimulus constructions used by the questions",items:{type:"object",additionalProperties:false,properties:{
      key:{type:"string",description:"identifier referenced by questions, e.g. 'sq-di'"},
      base:{type:"string",description:"base shape: triangle, square, diamond, pentagon, hexagon, heptagon, octagon, nonagon, decagon, circle, star, or 'N-gon' / 'N star'"},
      sub:{type:"string",description:"sub-shape at each vertex: same names, or 'none' for a solid shape"},
      frame:{type:"string",enum:["screen","vertex"],description:"screen: sub-shapes keep absolute orientation when the base rotates; vertex: they point outward and co-rotate"},
      subRatio:{type:"number",description:"sub-shape size as a fraction of the base radius, 0.05-0.6 (default 0.18)"}},
      required:["key","base","sub","frame","subRatio"]}},
    questions:{type:"array",description:"each question: reference A and two comparisons B, C that differ from A only in rotations",items:{type:"object",additionalProperties:false,properties:{
      shape:{type:"string",description:"key of the shape construction"},
      A:{type:"object",additionalProperties:false,properties:{baseRot:{type:"number"},subRot:{type:"number"}},required:["baseRot","subRot"]},
      B:{type:"object",additionalProperties:false,properties:{baseRot:{type:"number"},subRot:{type:"number"}},required:["baseRot","subRot"]},
      C:{type:"object",additionalProperties:false,properties:{baseRot:{type:"number"},subRot:{type:"number"}},required:["baseRot","subRot"]},
      note:{type:"string",description:"what this question tests, in a few words"}},
      required:["shape","A","B","C","note"]}},
    settings:{type:"object",additionalProperties:false,properties:{
      repeats:{type:"integer"},shuffle:{type:"boolean"},swapSides:{type:"boolean"},fixation:{type:"boolean"}},
      required:["repeats","shuffle","swapSides","fixation"]}
  },
  required:["experiment","shapes","questions","settings"]
};

export const SYSTEM=`You design stimulus sets for a perception experiment on how rotation influences similarity judgements.

Stimuli are configural shapes: a base polygon whose vertices are occupied by sub-shapes (e.g. a square made of diamonds, a hexagon of triangles), drawn black on white. Every object is described by: base shape, its rotation baseRot (degrees), the sub-shape, its orientation subRot (degrees), the sub-shape relative size, and the frame. The frame is the core manipulation: in the "screen" frame sub-shapes keep their absolute orientation when the base configuration rotates; in the "vertex" frame sub-shapes point outward from the center and co-rotate with the base (configural vs elemental rotation).

A similarity question shows a reference A and two comparisons B and C, asking "Is A more similar to B or to C?". B and C must differ from A only in rotations (baseRot and/or subRot). Typical designs: B rotates the whole configuration while C rotates only the sub-shapes (or only the base); B and C use the same magnitude but different components; a magnitude series (15°, 30°, 45°, 60°, 90°); the same relation shown from different reference orientations; the same set in both frames.

Available shape names: ${SHAPE_NAMES.join(", ")}, or "N-gon" (3-24) and "N star" (4-12). Rotations are integers in degrees (0-359). Keep sub-shape relative size at 0.18 unless the request implies otherwise. Produce between 3 and 24 questions unless the request asks for a specific number, and choose an informative experiment name. Reuse one shape construction across questions when the design varies only rotations.`;

/* the Messages API request body (without credentials) */
export function buildRequestBody(text,context={}){
  const ctx=[];
  if(context.shapes&&context.shapes.length)ctx.push(`Shapes already on the canvas (reuse when sensible): ${context.shapes.join("; ")}.`);
  if(context.questions)ctx.push(`The canvas already has ${context.questions} question(s); the new ones will be added alongside.`);
  return {
    model:MODEL,
    max_tokens:16000,
    system:SYSTEM,
    messages:[{role:"user",content:[text.trim(),...ctx].join("\n\n")}],
    output_config:{format:{type:"json_schema",schema:PLAN_SCHEMA}}
  };
}
/* the plan from a Messages API response */
export function parsePlan(response){
  if(!response||!Array.isArray(response.content))throw new Error("unexpected response");
  if(response.stop_reason==="refusal")throw new Error("the request was declined"+(response.stop_details?.explanation?": "+response.stop_details.explanation:""));
  const text=response.content.filter(b=>b.type==="text").map(b=>b.text).join("");
  if(!text)throw new Error("empty response");
  const plan=JSON.parse(text);
  if(!Array.isArray(plan.shapes)||!Array.isArray(plan.questions)||!plan.questions.length)throw new Error("the plan has no questions");
  return plan;
}

/* direct-from-browser call with the experimenter's own key (opt-in) */
export async function requestPlanDirect(body,apiKey,fetch=globalThis.fetch){
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
    headers:{"content-type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify(body)});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(data?.error?.message||`${r.status} ${r.statusText}`);
  return parsePlan(data);
}
/* via the Supabase Edge Function, which holds the key and checks the experimenter's session */
export async function requestPlanViaFunction(body,{url,anonKey,token},fetch=globalThis.fetch){
  const r=await fetch(`${String(url).replace(/\/+$/,"")}/functions/v1/describe`,{method:"POST",
    headers:{"content-type":"application/json","apikey":anonKey,"Authorization":`Bearer ${token}`},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(data?.error||data?.message||`${r.status} ${r.statusText}`);
  return parsePlan(data);
}

/* ---- materialising a plan on the canvas ----
   ctx: {tray, items, questions, experiments, nextId, parseShape, norm, layoutQuestion, questionTitle, newExperiment, nextOrdinal, BASE_R, Q_DX, Q_DY, origin:{x,y}} */
export function materializePlan(plan,ctx){
  const {tray,items,questions,experiments,nextId,parseShape,norm,layoutQuestion,questionTitle,newExperiment,nextOrdinal,BASE_R,Q_DX,Q_DY}=ctx;
  const origin=ctx.origin||{x:0,y:0};
  const problems=[];
  // shape constructions → tray entries (reuse an identical existing one)
  const byKey=new Map();
  (plan.shapes||[]).forEach(sh=>{
    const def=parseShape(String(sh.base||""));
    const subName=String(sh.sub||"none");
    const anchor=/^none$|^-$|^solid$/i.test(subName)?{none:true}:parseShape(subName);
    if(!def||def.none){problems.push(`unknown base shape “${sh.base}”`);return;}
    if(!anchor){problems.push(`unknown sub-shape “${sh.sub}”`);return;}
    const frame=sh.frame==="vertex"?"vertex":"screen";
    const ratio=Math.max(0.05,Math.min(0.6,+sh.subRatio||0.18));
    const same=t=>t.def.name===def.name&&((t.anchor&&t.anchor.none)?anchor.none:t.anchor&&t.anchor.name===anchor.name)&&t.frame===frame&&Math.abs((t.anchorRatio||0.18)-ratio)<1e-6;
    let entry=tray.find(same);
    if(!entry){entry={id:nextId(),def,anchor,baseRot:0,anchorRot:0,frame,anchorRatio:ratio};tray.push(entry);}
    byKey.set(sh.key,entry);
  });
  // questions → three objects each, laid out in rows below/right of the origin
  const created=[];
  const s=1, gapX=2*BASE_R*Q_DX*s+BASE_R*2.4*s, gapY=2*BASE_R*Q_DY*s+BASE_R*3.2*s, perRow=3;
  (plan.questions||[]).forEach((pq,k)=>{
    const entry=byKey.get(pq.shape);
    if(!entry){problems.push(`question ${k+1} references unknown shape “${pq.shape}”`);return;}
    const mk=(m)=>({id:nextId(),trayRef:entry,x:0,y:0,scale:s,baseRot:norm(+m.baseRot||0),anchorRot:norm(+m.subRot||0),frame:entry.frame,anchorRatio:entry.anchorRatio,label:null,qId:null});
    const A=mk(pq.A||{}),B=mk(pq.B||{}),C=mk(pq.C||{});
    items.push(A,B,C);
    const idx=created.length;
    const q={id:nextId(),title:"",a:A.id,b:B.id,c:C.id,cx:origin.x+(idx%perRow)*gapX,cy:origin.y+Math.floor(idx/perRow)*gapY,s,anchorRatio:entry.anchorRatio};
    [A,B,C].forEach(it=>it.qId=q.id);
    questions.push(q);
    q.title=questionTitle(questions.length,A,B,C)+(pq.note?` · ${String(pq.note).trim()}`:"");
    layoutQuestion(q);
    created.push(q);
  });
  let exp=null;
  if(created.length){
    exp=newExperiment(nextId(),nextOrdinal(experiments),(plan.experiment&&plan.experiment.name)||null,created.map(q=>q.id));
    const st=plan.settings||{};
    exp.settings={repeats:Math.max(1,Math.min(50,parseInt(st.repeats)||1)),shuffle:st.shuffle!==false,swapSides:st.swapSides!==false,fixation:st.fixation!==false,fullscreen:true};
    experiments.push(exp);
  }
  return {questions:created,experiment:exp,problems,rationale:plan.experiment&&plan.experiment.rationale||""};
}
