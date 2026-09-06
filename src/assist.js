/* "Describe the experiment you want", wired to the page: a dialog with a
   free-text request; Claude answers with a structured plan (src/describe.js)
   that is materialised on the canvas as shapes, questions and a new
   experiment — one undo step. */

import { $ } from "./dom.js";
import { BASE_R, Q_DX, Q_DY, parseShape, norm } from "./geometry.js";
import { questionTitle } from "./variants.js";
import { tray, items, questions, experiments, view, nextId } from "./state.js";
import { newExperiment } from "./experiment.js";
import { layoutQuestion } from "./questions.js";
import { addTrayItem } from "./tray.js";
import { renderCanvas } from "./canvas.js";
import { commit } from "./history.js";
import { buildRequestBody, requestPlanDirect, requestPlanViaFunction, materializePlan } from "./describe.js";
import { aiConfig, ensureToken, openConnections } from "./cloud.js";
import { openExpPanel, refreshExpBar, newOrdinal } from "./run.js";

let toast=()=>{}, aborter=null;

const describeTray=t=>`${t.def.name}${t.anchor&&!t.anchor.none?" of "+t.anchor.name+"s":" (solid)"}, ${t.frame} frame`;

function setBusy(on){
  $("describeGo").hidden=on;$("describeStop").hidden=!on;
  $("describeText").disabled=on;
  $("describeStatus").textContent=on?"thinking… this usually takes 20–60 seconds":"";
}
function modeLine(){
  const c=aiConfig();
  if(c.mode==="direct")return c.apiKey?"using your own API key":"no API key yet — set one under ⚙ settings → online & AI";
  return c.available?"through your Supabase project":"sign in under ⚙ settings → online & AI to use this";
}
export function openDescribe(){
  $("describeErr").textContent="";$("describeStatus").textContent="";
  $("describeMode").textContent=modeLine();
  $("describeResult").hidden=true;$("describeForm").hidden=false;
  $("describeDlg").hidden=false;
  $("describeText").focus();
}
export function closeDescribe(){
  if(aborter){aborter.abort();aborter=null;setBusy(false);}
  $("describeDlg").hidden=true;
}
/* where the new questions go: below everything on the canvas, then pan there */
function placement(){
  const s=1, half=BASE_R*Q_DY*s+BASE_R*1.6*s;
  const maxY=items.length?Math.max(...items.map(i=>i.y+BASE_R*1.4*i.scale)):-half;
  return {x:BASE_R*Q_DX*s+BASE_R*1.8*s,y:maxY+half+BASE_R*1.2*s};
}
async function generate(){
  const text=$("describeText").value.trim();
  if(!text){$("describeErr").textContent="describe the experiment first";$("describeText").focus();return;}
  const c=aiConfig();
  if(!c.available){$("describeErr").textContent=c.mode==="direct"?"no API key — set one under ⚙ settings → online & AI":"sign in under ⚙ settings → online & AI first";return;}
  $("describeErr").textContent="";
  setBusy(true);
  aborter=new AbortController();
  const signal=aborter.signal;
  const fetchWithSignal=(u,o)=>fetch(u,{...o,signal});
  try{
    const body=buildRequestBody(text,{shapes:tray.map(describeTray),questions:questions.length});
    const plan=c.mode==="direct"?await requestPlanDirect(body,c.apiKey,fetchWithSignal):
      await requestPlanViaFunction(body,{url:c.url,anonKey:c.anonKey,token:await ensureToken()},fetchWithSignal);
    const before=new Set(tray.map(t=>t.id));
    const origin=placement();
    const res=materializePlan(plan,{tray,items,questions,experiments,nextId,parseShape,norm,layoutQuestion,questionTitle,newExperiment,nextOrdinal:()=>newOrdinal(),BASE_R,Q_DX,Q_DY,origin});
    tray.filter(t=>!before.has(t.id)).forEach(addTrayItem);
    if(!res.questions.length)throw new Error("nothing could be built from the plan"+(res.problems.length?": "+res.problems.join("; "):""));
    view.z=1;view.tx=40-(origin.x-BASE_R*Q_DX-BASE_R*1.6);view.ty=60-(origin.y-BASE_R*Q_DY-BASE_R*1.6);
    renderCanvas();refreshExpBar();
    if(res.experiment)openExpPanel(res.experiment.id);
    commit();
    const n=res.questions.length, code=res.experiment?`${res.experiment.name} (E${res.experiment.n})`:"";
    $("describeResultText").textContent=`${n} question${n===1?"":"s"} added${code?" as "+code:""}.`+(res.rationale?" "+res.rationale:"")+
      (res.problems.length?`\n\nSkipped: ${res.problems.join("; ")}.`:"")+"\n\nEverything is editable on the canvas; ⌘/ctrl Z removes it all.";
    $("describeForm").hidden=true;$("describeResult").hidden=false;$("describeClose").focus();
    toast(`${n} question${n===1?"":"s"} added`);
  }catch(err){
    if(err&&err.name==="AbortError")return;
    $("describeErr").textContent=String(err.message||err);
  }finally{
    aborter=null;setBusy(false);
  }
}
export function initAssist(opts){
  toast=opts.toast||(()=>{});
  $("describeGo").addEventListener("click",generate);
  $("describeStop").addEventListener("click",()=>{if(aborter){aborter.abort();aborter=null;}setBusy(false);$("describeStatus").textContent="stopped";});
  $("describeCancel").addEventListener("click",closeDescribe);
  $("describeClose").addEventListener("click",closeDescribe);
  $("describeSetup").addEventListener("click",()=>{closeDescribe();openConnections();});
  $("describeDlg").addEventListener("pointerdown",e=>{if(e.target===$("describeDlg"))closeDescribe();});
  $("describeText").addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){e.preventDefault();generate();}});
  window.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("describeDlg").hidden)closeDescribe();});
}
