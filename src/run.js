/* The experiment dimension: marking questions, the experiment panel and
   the pilot runner. Everything drawn here comes from experiment.js, which
   reads the same objects as the canvas. */

import { $ } from "./dom.js";
import { items, questions, sel, findItem, findQuestion } from "./state.js";
import { calib, pxToMm, visualAngleDeg } from "./calibration.js";
import { PROMPT, experimentQuestions, buildTrials, trialGeometry, stimulusMarkup, resultRow, toCSV, summarize } from "./experiment.js";
import { exportStimuli } from "./stimexport.js";
import { renderCanvas } from "./canvas.js";
import { showPanel, deselect } from "./console.js";
import { commit } from "./history.js";

let lastRun=null;   // {participant, rows, when}

/* ---- marking ---- */
export function toggleInExperiment(q){
  q.inExp=!q.inExp;
  renderCanvas();
  refreshExpBar();
  commit();
}
export function syncExpToggle(q){
  const b=$("qExpToggle");
  b.textContent=q.inExp?"★ in experiment":"☆ include in experiment";
  b.classList.toggle("on",!!q.inExp);
}
export function refreshExpBar(){
  const n=experimentQuestions(questions).length;
  $("expInfo").textContent=n?`experiment · ${n} question${n===1?"":"s"}`:"experiment · none yet";
  $("expBar").classList.toggle("empty",!n);
}

/* ---- panel ---- */
/* the panel lists every question on the canvas; ticking one includes it */
function refreshPilotState(){
  const n=experimentQuestions(questions).length;
  const reps=Math.max(1,parseInt($("expRepeats").value)||1);
  $("pilotBtn").disabled=!n;
  $("pilotHint").textContent=!questions.length?"":
    !n?"tick at least one question above to run it":
    `${n} question${n===1?"":"s"} × ${reps} = ${n*reps} trial${n*reps===1?"":"s"}`;
}
export function openExpPanel(){
  sel.id=null;sel.ids=[];sel.qId=null;
  renderCanvas();
  const list=$("expList");
  list.innerHTML="";
  if(!questions.length){
    list.innerHTML='<p class="note">no questions on the canvas yet — place three objects, select them and press “make similarity question”.</p>';
  }else{
    const tools=document.createElement("div");
    tools.className="expTools";
    const all=experimentQuestions(questions).length===questions.length;
    tools.innerHTML=`<span class="note" style="margin:0">tick the questions to run</span><button type="button">${all?"none":"all"}</button>`;
    tools.querySelector("button").onclick=()=>{questions.forEach(q=>q.inExp=!all);renderCanvas();refreshExpBar();openExpPanel();commit();};
    list.appendChild(tools);
  }
  questions.forEach((q,i)=>{
    const row=document.createElement("label");
    row.className="expRow";
    row.innerHTML=`<input type="checkbox" ${q.inExp?"checked":""}><span class="n">${i+1}</span><span class="t"></span>`;
    row.querySelector(".t").textContent=q.title;
    row.title=q.title;
    row.querySelector("input").addEventListener("change",e=>{
      q.inExp=e.target.checked;renderCanvas();refreshExpBar();refreshPilotState();commit();
      const t=list.querySelector(".expTools button");if(t)t.textContent=experimentQuestions(questions).length===questions.length?"none":"all";
    });
    list.appendChild(row);
  });
  refreshPilotState();
  $("expDownload").disabled=!lastRun;
  $("expLast").textContent=lastRun?`last run: ${lastRun.participant}, ${lastRun.rows.length} trials`:"";
  showPanel("expPanel");
}

/* ---- runner ---- */
const FIX_MS=500, ITI_MS=400;
let trials=[],idx=0,rows=[],participant="pilot",shownAt=0,accepting=false,opts={};

function setPhase(p){   // "start" | "fix" | "stim" | "blank" | "end"
  $("runStart").hidden=p!=="start";
  $("runFix").hidden=p!=="fix";
  $("runPrompt").hidden=p!=="stim";$("runStage").hidden=p!=="stim";$("runChoice").hidden=p!=="stim";
  $("runEnd").hidden=p!=="end";
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
  rows.push(resultRow(t,{participant,response:r,rt,pxPerMm:calib.pxPerMm,calibrated:calib.calibrated,
                         timestamp:new Date().toISOString(),sizes:t.sizes,deg:mm=>visualAngleDeg(mm),
                         distanceCm:calib.distanceCm,fixationMs:opts.fixation?FIX_MS:0}));
  setPhase("blank");
  idx++;
  setTimeout(()=>{ if(idx<trials.length)showTrial(); else finish(); },ITI_MS);
}
function finish(){
  lastRun={participant,rows,when:new Date().toISOString()};
  const tb=$("runTable");
  tb.innerHTML="<tr><th>#</th><th>question</th><th>B side</th><th>response</th><th>rt (ms)</th></tr>"+
    rows.map(r=>`<tr><td>${r.trial}</td><td></td><td>${r.B_side}</td><td>${r.response}</td><td>${r.rt_ms}</td></tr>`).join("");
  [...tb.querySelectorAll("tr")].slice(1).forEach((tr,i)=>tr.children[1].textContent=rows[i].question_title);
  const perQ=summarize(rows);
  const all=summarize(rows.map(r=>({...r,question_id:0})))[0];
  $("runSummary").textContent=`${rows.length} trials · B chosen ${Math.round(all.pB*100)}% overall`+
    (perQ.length>1?" (per question: "+perQ.map(q=>`${Math.round(q.pB*100)}%`).join(", ")+")":"")+
    ` · median RT ${Math.round(all.medianRt)} ms`;
  $("runCount").textContent="";
  setPhase("end");
  leaveFullscreen();
}
function leaveFullscreen(){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
export function startPilot(){
  participant=($("expPid").value.trim()||"pilot");
  opts={shuffle:$("expShuffle").checked,swapSides:$("expSwap").checked,fixation:$("expFix").checked,full:$("expFull").checked,
        repeats:Math.max(1,parseInt($("expRepeats").value)||1)};
  trials=buildTrials(questions,findItem,{shuffle:opts.shuffle,swapSides:opts.swapSides,repeats:opts.repeats});
  if(!trials.length)return;
  idx=0;rows=[];
  $("runIntro").textContent=`Participant ${participant} · ${trials.length} trial${trials.length===1?"":"s"}`;
  $("run").hidden=false;
  setPhase("start");
  $("runBegin").focus();
}
function begin(){
  if(opts.full&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});
  showTrial();
}
function quit(){
  accepting=false;
  $("run").hidden=true;
  leaveFullscreen();
  openExpPanel();
}
export function downloadLastRun(){
  if(!lastRun)return;
  const csv=toCSV(lastRun.rows);
  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${lastRun.participant}-${lastRun.when.replace(/[:.]/g,"-")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function exportStimuliZip(){
  const b=$("expExport");
  b.disabled=true;b.textContent="exporting…";
  try{
    const {blob,count}=await exportStimuli(questions,findItem,{scale:2,onProgress:(n,t)=>{b.textContent=`exporting ${n} / ${t}…`;}});
    const name=($("canvasName").value.trim()||"stimuli").replace(/\s+/g,"-");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=`${name}-stimuli.zip`;a.click();
    URL.revokeObjectURL(a.href);
    $("expLast").textContent=`exported ${count} question${count===1?"":"s"} as SVG + PNG with manifest.csv`;
  }catch(err){
    alert("Could not export stimuli: "+err.message);
  }
  b.disabled=false;b.textContent="export stimuli (zip)";
}

export function initExperiment(){
  $("runPrompt").textContent=PROMPT;
  $("expBar").addEventListener("click",openExpPanel);
  $("qExpToggle").addEventListener("click",()=>{const q=findQuestion(sel.qId);if(q){toggleInExperiment(q);syncExpToggle(q);}});
  $("pilotBtn").addEventListener("click",startPilot);
  $("expDownload").addEventListener("click",downloadLastRun);
  $("expDone").addEventListener("click",deselect);
  $("runEndDownload").addEventListener("click",downloadLastRun);
  $("runEndClose").addEventListener("click",quit);
  $("runQuit").addEventListener("click",quit);
  $("runBegin").addEventListener("click",begin);
  $("expRepeats").addEventListener("input",refreshPilotState);
  $("expExport").addEventListener("click",exportStimuliZip);
  document.querySelectorAll("#runChoice button").forEach(b=>b.addEventListener("click",()=>respond(b.dataset.r)));
  window.addEventListener("keydown",e=>{
    if($("run").hidden)return;
    if(!$("runStart").hidden){if(e.key===" "||e.key==="Enter"){e.preventDefault();begin();}else if(e.key==="Escape")quit();return;}
    if(e.key==="b"||e.key==="B")respond("B");
    else if(e.key==="c"||e.key==="C")respond("C");
    else if(e.key==="Escape")quit();
  });
  refreshExpBar();
}
