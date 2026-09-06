/* The experiment layer: named subsets of the canvas's questions with their
   own run settings. The footer strip under the console lists them; opening
   one shows its panel and a lens on the canvas (non-members fade, every
   title gets a ■/□ toggle). The lens lasts exactly as long as the panel is
   open. The pilot runner and the stimulus export draw from experiment.js,
   which reads the same objects as the canvas. */

import { $ } from "./dom.js";
import { questions, experiments, sel, findItem, findQuestion, findExperiment, nextId, clearSelection } from "./state.js";
import { calib, pxToMm, visualAngleDeg } from "./calibration.js";
import { PROMPT, experimentQuestions, experimentCode, newExperiment, nextOrdinal, isMember, setMembership,
         buildTrials, trialGeometry, stimulusMarkup, resultRow, toCSV, summarize, normalizeSettings } from "./experiment.js";
import { exportStimuli } from "./stimexport.js";
import { buildXlsx } from "./xlsx.js";
import { CSV_COLUMNS } from "./experiment.js";
import { renderCanvas, setHoverQuestion } from "./canvas.js";
import { showPanel, deselect, openQPanel } from "./console.js";
import { commit, commitSoon } from "./history.js";
import { refreshOnlineSection } from "./cloud.js";
import { openDescribe } from "./assist.js";

const lastRuns=new Map();   // experiment id → {participant, rows, when}
let participant="pilot";

/* ---- creating and editing experiments ---- */
export function createExperiment(questionIds=[]){
  const e=newExperiment(nextId(),nextOrdinal(experiments),null,[]);
  questionIds.forEach(id=>setMembership(e,id,true,questions));
  experiments.push(e);
  return e;
}
export function toggleMembership(exp,qId){
  if(!exp||!findQuestion(qId))return;
  setMembership(exp,qId,!isMember(exp,qId),questions);
  renderCanvas();refreshExpBar();
  if(sel.expId===exp.id)refreshExpPanel();
  if(sel.qId===qId)syncExpChips(findQuestion(qId));
  commit();
}
const chipLabel=e=>`${experimentCode(e)} ${e.name}`;

/* ---- footer strip ---- */
export function refreshExpBar(){
  const bar=$("expBar");
  bar.innerHTML="";
  experiments.forEach(e=>{
    const b=document.createElement("button");
    b.className="chip"+(sel.expId===e.id?" on":"");
    b.textContent=`${chipLabel(e)} · ${e.questions.length}`;
    b.title=`${e.name}: ${e.questions.length} question${e.questions.length===1?"":"s"} — open`;
    b.onclick=()=>{sel.expId===e.id?deselect():openExpPanel(e.id);};
    bar.appendChild(b);
  });
  const add=document.createElement("button");
  add.className="chip add";
  add.textContent=experiments.length?"+":"+ experiment";
  add.title="new experiment";
  add.onclick=()=>{const e=createExperiment();openExpPanel(e.id);commit();$("expName").focus();$("expName").select();};
  bar.appendChild(add);
  const ai=document.createElement("button");
  ai.className="chip ai";
  ai.textContent="describe…";
  ai.title="describe the experiment you want in words — the shapes and questions are built for you (AI)";
  ai.onclick=openDescribe;
  bar.appendChild(ai);
  bar.classList.toggle("empty",!experiments.length);
}

/* ---- chips in the question panel ---- */
export function syncExpChips(q){
  const box=$("qExpChips");
  box.innerHTML="";
  const lab=document.createElement("span");
  lab.className="lbl";lab.textContent="experiments";
  box.appendChild(lab);
  experiments.forEach(e=>{
    const b=document.createElement("button");
    const on=isMember(e,q.id);
    b.className="chip"+(on?" on":"");
    b.textContent=chipLabel(e);
    b.title=on?`in ${e.name} — click to remove`:`not in ${e.name} — click to add`;
    b.onclick=()=>toggleMembership(e,q.id);
    box.appendChild(b);
  });
  const add=document.createElement("button");
  add.className="chip add";
  add.textContent=experiments.length?"+":"+ new experiment with this question";
  add.title="new experiment containing this question";
  add.onclick=()=>{createExperiment([q.id]);refreshExpBar();syncExpChips(q);renderCanvas();commit();};
  box.appendChild(add);
}

/* ---- experiment panel ---- */
export function openExpPanel(expId){
  const exp=findExperiment(expId);
  if(!exp)return;
  clearSelection();
  sel.expId=expId;
  renderCanvas();
  refreshExpPanel();
  refreshExpBar();
  showPanel("expPanel");
}
function readSettings(){
  return normalizeSettings({repeats:$("expRepeats").value,shuffle:$("expShuffle").checked,swapSides:$("expSwap").checked,
                            fixation:$("expFix").checked,fullscreen:$("expFull").checked});
}
function refreshSummary(exp){
  const n=exp.questions.length, s=exp.settings, total=n*s.repeats;
  $("expSummary").textContent=n?`${n} question${n===1?"":"s"} × ${s.repeats} = ${total} trial${total===1?"":"s"}`+
    (s.shuffle?" · shuffled":" · canvas order")+(s.swapSides?" · B/C sides swapped":"")+(s.fixation?" · fixation":""):
    "no questions yet";
  $("pilotBtn").disabled=!n;
  $("pilotHint").textContent=!questions.length?"the canvas has no questions yet":
    !n?"tick at least one question above (or click a □ on the canvas)":"";
  const run=lastRuns.get(exp.id);
  $("expDownload").disabled=!run;$("expDownloadX").disabled=!run;
  $("expLast").textContent=run?`last run: ${run.participant}, ${run.rows.length} trials`:"";
}
export function refreshExpPanel(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  $("expCode").textContent=experimentCode(exp);
  if(document.activeElement!==$("expName"))$("expName").value=exp.name;
  const s=exp.settings;
  $("expRepeats").value=s.repeats;$("expShuffle").checked=s.shuffle;$("expSwap").checked=s.swapSides;
  $("expFix").checked=s.fixation;$("expFull").checked=s.fullscreen;
  $("expPid").value=participant;
  const list=$("expList");
  list.innerHTML="";
  if(!questions.length){
    list.innerHTML='<p class="note">no questions on the canvas yet — place three objects, select them and press “make similarity question”.</p>';
  }else{
    const tools=document.createElement("div");
    tools.className="expTools";
    const all=exp.questions.length===questions.length;
    tools.innerHTML=`<span class="note" style="margin:0">tick the questions in this experiment</span><button type="button">${all?"none":"all"}</button>`;
    tools.querySelector("button").onclick=()=>{questions.forEach(q=>setMembership(exp,q.id,!all,questions));renderCanvas();refreshExpBar();refreshExpPanel();commit();};
    list.appendChild(tools);
    questions.forEach((q,i)=>{
      const row=document.createElement("div");
      row.className="expRow";
      row.innerHTML=`<input type="checkbox" ${isMember(exp,q.id)?"checked":""} title="include in this experiment"><span class="n">${i+1}</span><span class="t" title="show on the canvas"></span>`;
      row.querySelector(".t").textContent=q.title;
      row.querySelector("input").addEventListener("change",()=>toggleMembership(exp,q.id));
      row.addEventListener("pointerenter",()=>setHoverQuestion(q.id));
      row.addEventListener("pointerleave",()=>setHoverQuestion(null));
      row.querySelector(".t").addEventListener("click",()=>{setHoverQuestion(null);clearSelection();sel.qId=q.id;renderCanvas();openQPanel();refreshExpBar();});
      list.appendChild(row);
    });
  }
  refreshSummary(exp);
  refreshOnlineSection(exp);
}
function duplicateExperiment(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  const e=newExperiment(nextId(),nextOrdinal(experiments),`${exp.name} copy`,exp.questions);
  e.settings={...exp.settings};
  experiments.push(e);
  openExpPanel(e.id);commit();
}
function deleteExperiment(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  if(!confirm(`Delete experiment ${experimentCode(exp)} “${exp.name}”? The questions stay on the canvas.`))return;
  experiments.splice(experiments.indexOf(exp),1);
  lastRuns.delete(exp.id);
  deselect();commit();
}

/* ---- runner ----
   One runner for two callers: the pilot (from the experiment panel, results
   kept in memory) and a participant session (src/cloud.js: trials from a
   published definition, every row posted as it is answered). cfg:
   {exp, trials, settings, participant, canvas, mode:"pilot"|"participant",
    intro, instructions, onRow(row,trial), onFinish(rows)} */
const FIX_MS=500, ITI_MS=400;
let trials=[],idx=0,rows=[],shownAt=0,accepting=false,opts={},runExp=null,runCfg={};

export function setPhase(p){   // "start" | "fix" | "stim" | "blank" | "end" | "msg" | "thanks"
  $("runStart").hidden=p!=="start";
  $("runFix").hidden=p!=="fix";
  $("runPrompt").hidden=p!=="stim";$("runStage").hidden=p!=="stim";$("runChoice").hidden=p!=="stim";
  $("runEnd").hidden=p!=="end";
  $("runMsg").hidden=p!=="msg";
  $("runThanks").hidden=p!=="thanks";
}
/* a plain screen inside the run overlay (loading, errors, instructions) */
export function showMessage({title="",text="",button="",onClick=null,html=false}={}){
  $("run").hidden=false;
  $("runMsgTitle").textContent=title;
  if(html)$("runMsgText").innerHTML=text;else $("runMsgText").textContent=text;
  const b=$("runMsgBtn");
  b.hidden=!button;b.textContent=button;b.onclick=onClick;
  setPhase("msg");
  if(button)b.focus();
}
function memberSizesMm(svg){
  const out={};
  ["A","B","C"].forEach(k=>{
    const g=svg.querySelector(`g[data-m="${k}"]`);
    if(!g)return;
    const bb=g.getBBox(), s=parseFloat((g.getAttribute("transform").match(/scale\(([^)]+)\)/)||[0,1])[1]);
    out[k]={w:pxToMm(bb.width*s),h:pxToMm(bb.height*s)};
  });
  return out;
}
function showTrial(){
  const t=trials[idx];
  $("runCount").textContent=`${idx+1} / ${trials.length}`;
  const g=trialGeometry(t);
  const svg=$("runSvg");
  svg.setAttribute("viewBox",g.viewBox.join(" "));
  svg.setAttribute("width",g.viewBox[2]);
  svg.setAttribute("height",g.viewBox[3]);
  svg.innerHTML=stimulusMarkup(t);
  const go=()=>{setPhase("stim");t.sizes=memberSizesMm(svg);shownAt=performance.now();accepting=true;};
  if(opts.fixation){setPhase("fix");setTimeout(go,FIX_MS);}
  else go();
}
function respond(r){
  if(!accepting)return;
  accepting=false;
  const rt=performance.now()-shownAt;
  const t=trials[idx];
  const row=resultRow(t,{participant,canvas:runCfg.canvas||"",exp:runExp,response:r,rt,pxPerMm:calib.pxPerMm,calibrated:calib.calibrated,
                         timestamp:new Date().toISOString(),sizes:t.sizes,deg:mm=>visualAngleDeg(mm),
                         distanceCm:calib.distanceCm,fixationMs:opts.fixation?FIX_MS:0});
  rows.push(row);
  if(runCfg.onRow)try{runCfg.onRow(row,t);}catch{}
  setPhase("blank");
  idx++;
  setTimeout(()=>{ if(idx<trials.length)showTrial(); else finish(); },ITI_MS);
}
function finish(){
  $("runCount").textContent="";
  leaveFullscreen();
  if(runCfg.mode==="participant"){
    setPhase("thanks");
    if(runCfg.onFinish)runCfg.onFinish(rows);
    return;
  }
  lastRuns.set(runExp.id,{participant,rows,when:new Date().toISOString()});
  const tb=$("runTable");
  tb.innerHTML="<tr><th>#</th><th>question</th><th>B side</th><th>response</th><th>rt (ms)</th></tr>"+
    rows.map(r=>`<tr><td>${r.trial}</td><td></td><td>${r.B_side}</td><td>${r.response}</td><td>${r.rt_ms}</td></tr>`).join("");
  [...tb.querySelectorAll("tr")].slice(1).forEach((tr,i)=>tr.children[1].textContent=rows[i].question_title);
  const perQ=summarize(rows);
  const all=summarize(rows.map(r=>({...r,question_id:0})))[0];
  $("runSummary").textContent=`${experimentCode(runExp)} ${runExp.name} · ${rows.length} trials · B chosen ${Math.round(all.pB*100)}% overall`+
    (perQ.length>1?" (per question: "+perQ.map(q=>`${Math.round(q.pB*100)}%`).join(", ")+")":"")+
    ` · median RT ${Math.round(all.medianRt)} ms`;
  setPhase("end");
  if(runCfg.onFinish)runCfg.onFinish(rows);
}
function leaveFullscreen(){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
export function startRun(cfg){
  runCfg=cfg;runExp=cfg.exp;participant=cfg.participant||"pilot";
  opts=normalizeSettings(cfg.settings||{});
  trials=cfg.trials;idx=0;rows=[];accepting=false;
  document.body.classList.toggle("participantRun",cfg.mode==="participant");
  $("runQuit").hidden=cfg.mode==="participant";
  $("runIntro").textContent=cfg.intro||"";$("runIntro").hidden=!cfg.intro;
  $("runInstructions").textContent=cfg.instructions||"";$("runInstructions").hidden=!cfg.instructions;
  $("run").hidden=false;
  setPhase("start");
  $("runBegin").focus();
}
export function startPilot(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  const pid=($("expPid").value.trim()||"pilot");
  exp.settings=readSettings();
  const list=buildTrials(exp,questions,findItem);
  if(!list.length)return;
  startRun({exp,trials:list,settings:exp.settings,participant:pid,canvas:$("canvasName").value.trim(),mode:"pilot",
            intro:`${experimentCode(exp)} ${exp.name} · participant ${pid} · ${list.length} trial${list.length===1?"":"s"}`});
}
function begin(){
  if(opts.fullscreen&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});
  showTrial();
}
function quit(){
  if(runCfg.mode==="participant")return;   // a participant session has no way out but the end
  accepting=false;
  $("run").hidden=true;
  leaveFullscreen();
  if(runExp&&findExperiment(runExp.id))openExpPanel(runExp.id);else deselect();
}
/* results as .csv (one flat table) or .xlsx (results sheet + per-question summary sheet) */
const SUMMARY_COLS=["question_id","title","n","pB","medianRt"];
export function resultsFile(run,exp,format,columns=CSV_COLUMNS){
  const stem=`${experimentCode(exp)}-${exp.name.replace(/\s+/g,"-")}-${run.participant}-${run.when.replace(/[:.]/g,"-")}`;
  if(format==="xlsx"){
    const summary=summarize(run.rows).map(s=>({...s,pB:+s.pB.toFixed(3)}));
    return {name:`${stem}.xlsx`,blob:new Blob([buildXlsx([{name:"results",rows:run.rows,columns},{name:"summary",rows:summary,columns:SUMMARY_COLS}])],
            {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})};
  }
  return {name:`${stem}.csv`,blob:new Blob([toCSV(run.rows,columns)],{type:"text/csv"})};
}
export function downloadBlob(name,blob){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;a.click();
  URL.revokeObjectURL(a.href);
}
export function downloadLastRun(format="csv"){
  const exp=findExperiment(sel.expId)||runExp;
  const run=exp&&lastRuns.get(exp.id);
  if(!run)return;
  const f=resultsFile(run,exp,format);
  downloadBlob(f.name,f.blob);
}
async function exportStimuliZip(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  const b=$("expExport");
  b.disabled=true;b.textContent="exporting…";
  try{
    const {blob,count}=await exportStimuli(exp,questions,findItem,{scale:2,canvas:$("canvasName").value.trim(),onProgress:(n,t)=>{b.textContent=`exporting ${n} / ${t}…`;}});
    const name=($("canvasName").value.trim()||"stimuli").replace(/\s+/g,"-");
    downloadBlob(`${name}-${experimentCode(exp)}-stimuli.zip`,blob);
    $("expLast").textContent=`exported ${count} question${count===1?"":"s"} as SVG + PNG with manifest.csv`;
  }catch(err){
    alert("Could not export stimuli: "+err.message);
  }
  b.disabled=false;b.textContent="export stimuli (zip)";
}

export function initExperiment(){
  $("runPrompt").textContent=PROMPT;
  $("expName").addEventListener("input",()=>{
    const exp=findExperiment(sel.expId);
    if(!exp)return;
    exp.name=$("expName").value.trim()||`experiment ${exp.n}`;
    refreshExpBar();commitSoon();
  });
  ["expRepeats","expShuffle","expSwap","expFix","expFull"].forEach(id=>$(id).addEventListener("change",()=>{
    const exp=findExperiment(sel.expId);
    if(!exp)return;
    exp.settings=readSettings();
    refreshSummary(exp);commit();
  }));
  $("expRepeats").addEventListener("input",()=>{const exp=findExperiment(sel.expId);if(exp){exp.settings=readSettings();refreshSummary(exp);}});
  $("expPid").addEventListener("input",()=>{participant=$("expPid").value.trim()||"pilot";});
  $("pilotBtn").addEventListener("click",startPilot);
  $("expDownload").addEventListener("click",()=>downloadLastRun("csv"));
  $("expDownloadX").addEventListener("click",()=>downloadLastRun("xlsx"));
  $("expDone").addEventListener("click",deselect);
  $("expDup").addEventListener("click",duplicateExperiment);
  $("expDelete").addEventListener("click",deleteExperiment);
  $("runEndDownload").addEventListener("click",()=>downloadLastRun("csv"));
  $("runEndDownloadX").addEventListener("click",()=>downloadLastRun("xlsx"));
  $("runEndClose").addEventListener("click",quit);
  $("runQuit").addEventListener("click",quit);
  $("runBegin").addEventListener("click",begin);
  $("expExport").addEventListener("click",exportStimuliZip);
  document.querySelectorAll("#runChoice button").forEach(b=>b.addEventListener("click",()=>respond(b.dataset.r)));
  window.addEventListener("keydown",e=>{
    if($("run").hidden)return;
    if(!$("runStart").hidden){if(e.key===" "||e.key==="Enter"){e.preventDefault();begin();}else if(e.key==="Escape")quit();return;}
    if(!$("runMsg").hidden||!$("runThanks").hidden)return;
    if(e.key==="b"||e.key==="B")respond("B");
    else if(e.key==="c"||e.key==="C")respond("C");
    else if(e.key==="Escape")quit();
  });
  refreshExpBar();
}
