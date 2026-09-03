/* The experiment dimension: marking questions, the experiment panel and
   the pilot runner. Everything drawn here comes from experiment.js, which
   reads the same objects as the canvas. */

import { $ } from "./dom.js";
import { items, questions, sel, findItem, findQuestion } from "./state.js";
import { calib } from "./calibration.js";
import { downloadJSON } from "./io.js";
import { PROMPT, experimentQuestions, buildTrials, trialGeometry, stimulusMarkup, resultRow, toCSV } from "./experiment.js";
import { renderCanvas } from "./canvas.js";
import { showPanel, deselect } from "./console.js";

let lastRun=null;   // {participant, rows, when}

/* ---- marking ---- */
export function toggleInExperiment(q){
  q.inExp=!q.inExp;
  renderCanvas();
  refreshExpBar();
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
export function openExpPanel(){
  sel.id=null;sel.ids=[];sel.qId=null;
  renderCanvas();
  const list=$("expList");
  list.innerHTML="";
  const qs=experimentQuestions(questions);
  if(!qs.length){
    list.innerHTML='<p class="note">no questions yet — open a question and press “☆ include in experiment”.</p>';
  }
  qs.forEach((q,i)=>{
    const row=document.createElement("div");
    row.className="expRow";
    row.innerHTML=`<span class="n">${i+1}</span><span class="t"></span><button title="remove from experiment">×</button>`;
    row.querySelector(".t").textContent=q.title;
    row.querySelector("button").onclick=()=>{q.inExp=false;renderCanvas();refreshExpBar();openExpPanel();};
    list.appendChild(row);
  });
  $("pilotBtn").disabled=!qs.length;
  $("expDownload").disabled=!lastRun;
  $("expLast").textContent=lastRun?`last run: ${lastRun.participant}, ${lastRun.rows.length} trials`:"";
  showPanel("expPanel");
}

/* ---- runner ---- */
let trials=[],idx=0,rows=[],participant="pilot",shownAt=0,accepting=false;

function showTrial(){
  const t=trials[idx];
  $("runCount").textContent=`${idx+1} / ${trials.length}`;
  const g=trialGeometry(t);
  const svg=$("runSvg");
  svg.setAttribute("viewBox",g.viewBox.join(" "));
  svg.setAttribute("width",g.viewBox[2]);
  svg.setAttribute("height",g.viewBox[3]);
  svg.innerHTML=stimulusMarkup(t);
  $("runPrompt").hidden=false;$("runStage").hidden=false;$("runChoice").hidden=false;
  shownAt=performance.now();accepting=true;
}
function respond(r){
  if(!accepting)return;
  accepting=false;
  const rt=performance.now()-shownAt;
  rows.push(resultRow(trials[idx],{participant,response:r,rt,pxPerMm:calib.pxPerMm,calibrated:calib.calibrated,timestamp:new Date().toISOString()}));
  $("runStage").hidden=true;$("runChoice").hidden=true;   // blank inter-trial interval
  idx++;
  setTimeout(()=>{ if(idx<trials.length)showTrial(); else finish(); },400);
}
function finish(){
  lastRun={participant,rows,when:new Date().toISOString()};
  const tb=$("runTable");
  tb.innerHTML="<tr><th>#</th><th>question</th><th>response</th><th>rt (ms)</th></tr>"+
    rows.map(r=>`<tr><td>${r.trial}</td><td></td><td>${r.response}</td><td>${r.rt_ms}</td></tr>`).join("");
  [...tb.querySelectorAll("tr")].slice(1).forEach((tr,i)=>tr.children[1].textContent=rows[i].question_title);
  $("runCount").textContent="";$("runPrompt").hidden=true;
  $("runEnd").hidden=false;
}
export function startPilot(){
  participant=($("expPid").value.trim()||"pilot");
  trials=buildTrials(questions,findItem,{shuffle:$("expShuffle").checked});
  if(!trials.length)return;
  idx=0;rows=[];
  $("runEnd").hidden=true;
  $("run").hidden=false;
  showTrial();
}
function quit(){
  accepting=false;
  $("run").hidden=true;
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
  document.querySelectorAll("#runChoice button").forEach(b=>b.addEventListener("click",()=>respond(b.dataset.r)));
  window.addEventListener("keydown",e=>{
    if($("run").hidden)return;
    if(e.key==="b"||e.key==="B")respond("B");
    else if(e.key==="c"||e.key==="C")respond("C");
    else if(e.key==="Escape")quit();
  });
  refreshExpBar();
}
