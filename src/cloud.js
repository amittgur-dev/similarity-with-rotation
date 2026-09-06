/* Online runs, wired to the page: the "online & AI" connections dialog
   (Supabase project, experimenter sign-in, AI mode), publishing an
   experiment for participants, fetching results, and the participant flow
   that a ?run=<id> link opens. The REST client itself is src/online.js;
   the schema and policies are server/supabase/schema.sql. */

import { $ } from "./dom.js";
import { ONLINE_KEY, AUTH_KEY, makeClient, newSlug, participantLink, projectUrl, completionTarget, sessionsToRows, SESSION_COLUMNS } from "./online.js";
import { AI_KEY } from "./describe.js";
import { publishedDefinition, buildTrialsFromRecords, experimentCode, CSV_COLUMNS, normalizeSettings } from "./experiment.js";
import { questions, sel, findItem, findExperiment } from "./state.js";
import { calib, DEFAULT_DISTANCE_CM } from "./calibration.js";
import { startRun, showMessage, setPhase, resultsFile, downloadBlob } from "./run.js";
import { commit } from "./history.js";

let storage=null, toast=()=>{};
const cfg={url:"",anonKey:""};
const auth={access_token:"",refresh_token:"",expires_at:0,email:""};
const ai={mode:"supabase",apiKey:""};
const results=new Map();   // published id → {sessions, rows, when}

function read(key,fallback){try{return Object.assign({},fallback,JSON.parse(storage&&storage.getItem(key)||"null")||{});}catch{return {...fallback};}}
function write(key,obj){try{storage&&storage.setItem(key,JSON.stringify(obj));}catch{}}

export const connected=()=>!!(cfg.url&&cfg.anonKey);
export const signedIn=()=>!!auth.access_token;
export function aiConfig(){return {...ai,url:cfg.url,anonKey:cfg.anonKey,available:ai.mode==="direct"?!!ai.apiKey:(connected()&&signedIn())};}
export function client(){return makeClient({url:cfg.url,anonKey:cfg.anonKey,getToken:()=>auth.access_token||null});}
function setAuth(r){
  Object.assign(auth,{access_token:r.access_token||"",refresh_token:r.refresh_token||"",
    expires_at:r.expires_at||Math.floor(Date.now()/1000)+(r.expires_in||3600),email:(r.user&&r.user.email)||auth.email});
  write(AUTH_KEY,auth);
}
function clearAuth(){Object.assign(auth,{access_token:"",refresh_token:"",expires_at:0,email:""});write(AUTH_KEY,auth);}
/* a valid experimenter token, refreshed when within a minute of expiry */
export async function ensureToken(){
  if(!connected())throw new Error("connect your Supabase project first (⚙ settings → online & AI)");
  if(!auth.access_token)throw new Error("sign in first (⚙ settings → online & AI)");
  if(auth.expires_at&&auth.expires_at*1000-Date.now()<60000){
    try{setAuth(await client().refresh(auth.refresh_token));}
    catch{clearAuth();throw new Error("your sign-in has expired — sign in again (⚙ settings → online & AI)");}
  }
  return auth.access_token;
}

/* ---- connections dialog ---- */
function syncConnectForm(){
  $("sbUrl").value=cfg.url;$("sbKey").value=cfg.anonKey;
  if(auth.email)$("sbEmail").value=auth.email;
  $("sbSignIn").hidden=signedIn();$("sbSignOut").hidden=!signedIn();
  $("sbEmail").disabled=$("sbPass").disabled=signedIn();
  $("sbStatus").textContent=signedIn()?`signed in as ${auth.email}`:(connected()?"not signed in":"");
  document.querySelectorAll("input[name=aiMode]").forEach(r=>{r.checked=r.value===ai.mode;});
  $("aiKey").value=ai.apiKey;
  $("aiKeyField").hidden=ai.mode!=="direct";
  $("aiStatus").textContent=ai.mode==="direct"?(ai.apiKey?"key stored in this browser":"enter your key"):
    (signedIn()?"ready — the describe function of your project answers":"sign in above to use it");
}
export function openConnections(){syncConnectForm();$("connect").hidden=false;($("sbUrl").value?$("sbEmail"):$("sbUrl")).focus();}
export function closeConnections(){$("connect").hidden=true;if(sel.expId)refreshOnlineSection(findExperiment(sel.expId));}
async function signIn(){
  cfg.url=$("sbUrl").value.trim().replace(/\/+$/,"");cfg.anonKey=$("sbKey").value.trim();write(ONLINE_KEY,cfg);
  const email=$("sbEmail").value.trim(),pass=$("sbPass").value;
  if(!connected()){$("sbStatus").textContent="project URL and anon key first";return;}
  if(!email||!pass){$("sbStatus").textContent="email and password";return;}
  $("sbStatus").textContent="signing in…";$("sbSignIn").disabled=true;
  try{
    setAuth(await client().signIn(email,pass));
    $("sbPass").value="";
    toast(`signed in as ${auth.email}`);
    syncConnectForm();
  }catch(err){$("sbStatus").textContent="sign-in failed: "+err.message;}
  $("sbSignIn").disabled=false;
}

/* ---- experiment panel: the "participants online" section ---- */
export function refreshOnlineSection(exp){
  if(!exp)return;
  const o=exp.online;
  $("onlinePublished").hidden=!o;
  $("publishBtn").hidden=!!o;
  const st=$("onlineStatus");
  if(!o){
    st.textContent=!connected()?"to run this experiment with participants (e.g. recruited on Prolific), connect your Supabase project under ⚙ settings → online & AI.":
      !signedIn()?"sign in under ⚙ settings → online & AI, then publish.":
      "not published yet. Publishing freezes the experiment as it is now and gives you a participant link; every response is stored in your project.";
    $("publishBtn").disabled=!(connected()&&signedIn())||!exp.questions.length;
    return;
  }
  const when=new Date(o.when).toLocaleDateString();
  st.textContent=o.active?`published ${when} · ${o.records} trial${o.records===1?"":"s"} per session · id ${o.id}`:`unpublished (the link is closed; results remain) · id ${o.id}`;
  $("onlineLink").value=participantLink(location.href,o.id,cfg);
  $("unpublishBtn").hidden=!o.active;
  $("fetchBtn").disabled=!(connected()&&signedIn());
  const r=results.get(o.id);
  $("onlineCsv").disabled=!r||!r.rows.length;$("onlineXlsx").disabled=!r||!r.rows.length;
  $("onlineCount").textContent=r?`${r.sessions.length} session${r.sessions.length===1?"":"s"} · ${r.rows.length} trial${r.rows.length===1?"":"s"}`:"";
  const box=$("onlineSessions");
  box.innerHTML="";
  if(r&&r.sessions.length){
    const t=document.createElement("table");t.className="sessions";
    t.innerHTML="<tr><th>started</th><th>participant</th><th>trials</th><th>done</th></tr>";
    const shown=r.sessions.slice(-12);
    shown.forEach(s=>{
      const tr=document.createElement("tr");
      const d=new Date(s.created_at);
      [d.toLocaleDateString()+" "+d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
       (s.participant&&(s.participant.prolific_pid||s.participant.participant))||"—",
       String((s.trials||[]).length),s.completed?"✓":"…"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
      t.appendChild(tr);
    });
    box.appendChild(t);
    if(r.sessions.length>shown.length){const n=document.createElement("div");n.className="note";n.textContent=`… and ${r.sessions.length-shown.length} earlier`;box.appendChild(n);}
  }
}
function openPublish(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  const o=exp.online||{};
  const n=exp.questions.length,s=normalizeSettings(exp.settings);
  $("pubTitle").textContent=`${experimentCode(exp)} ${exp.name}`;
  $("pubSummary").textContent=`${n} question${n===1?"":"s"} × ${s.repeats} = ${n*s.repeats} trials per participant`+(s.shuffle?", shuffled":"")+(s.swapSides?", B/C sides swapped":"")+(s.fixation?", fixation cross":"")+
    `. The definition is frozen as it is now; later edits on the canvas do not change it. Participants calibrate their screen with a bank card first, so every response carries the true stimulus size.`;
  $("pubInstructions").value=o.instructions||"Thank you for taking part. On each trial you will see three figures. Decide whether A is more similar to B or to C, and answer with the B or C key. There are no right or wrong answers — go with your impression. The session takes a few minutes.";
  $("pubUrl").value=o.completionUrl||"";$("pubCode").value=o.completionCode||"";
  $("pubStatus").textContent="";$("pubGo").disabled=false;
  $("publishDlg").hidden=false;$("pubInstructions").focus();
}
function closePublish(){$("publishDlg").hidden=true;}
async function publish(){
  const exp=findExperiment(sel.expId);
  if(!exp)return;
  const instructions=$("pubInstructions").value.trim(),completionUrl=$("pubUrl").value.trim(),completionCode=$("pubCode").value.trim();
  $("pubStatus").textContent="publishing…";$("pubGo").disabled=true;
  try{
    await ensureToken();
    const canvas=$("canvasName").value.trim();
    const def=publishedDefinition(exp,questions,findItem,{canvas,instructions,completionUrl,completionCode});
    if(!def.records.length)throw new Error("the experiment has no complete questions");
    const id=newSlug(8);
    await client().publish({id,name:exp.name,canvas,experiment_code:experimentCode(exp),completion_url:completionTarget(def),definition:def,active:true});
    exp.online={id,when:new Date().toISOString(),active:true,records:def.records.length*def.experiment.settings.repeats,instructions,completionUrl,completionCode};
    commit();
    closePublish();
    refreshOnlineSection(exp);
    try{await navigator.clipboard.writeText($("onlineLink").value);toast("published — participant link copied");}catch{toast("published");}
  }catch(err){
    $("pubStatus").textContent="could not publish: "+err.message;$("pubGo").disabled=false;
  }
}
async function unpublish(){
  const exp=findExperiment(sel.expId);
  if(!exp||!exp.online)return;
  if(!confirm(`Close the participant link of ${experimentCode(exp)} “${exp.name}”? Sessions already running finish; new ones are refused. The results stay.`))return;
  try{
    await ensureToken();
    await client().setActive(exp.online.id,false);
    exp.online={...exp.online,active:false};
    commit();refreshOnlineSection(exp);toast("link closed");
  }catch(err){alert("Could not unpublish: "+err.message);}
}
async function fetchResults(){
  const exp=findExperiment(sel.expId);
  if(!exp||!exp.online)return;
  const b=$("fetchBtn");b.disabled=true;b.textContent="fetching…";
  try{
    await ensureToken();
    const sessions=await client().fetchSessions(exp.online.id);
    results.set(exp.online.id,{sessions,rows:sessionsToRows(sessions),when:new Date().toISOString()});
    refreshOnlineSection(exp);
    if(!sessions.length)toast("no sessions yet");
  }catch(err){alert("Could not fetch results: "+err.message);}
  b.disabled=false;b.textContent="fetch results";
}
function downloadOnline(format){
  const exp=findExperiment(sel.expId);
  const r=exp&&exp.online&&results.get(exp.online.id);
  if(!r||!r.rows.length)return;
  const f=resultsFile({participant:"online",rows:r.rows,when:r.when},exp,format,[...CSV_COLUMNS,...SESSION_COLUMNS]);
  downloadBlob(f.name,f.blob);
}
async function copyLink(){
  const v=$("onlineLink").value;
  try{await navigator.clipboard.writeText(v);toast("link copied");}
  catch{$("onlineLink").select();toast("select and copy the link");}
}

/* ---- participant flow (?run=<id>) ----
   hooks.calibrate(done): shows the card calibration and calls done() after it */
export async function startParticipant(params,hooks){
  document.body.classList.add("participant");
  const url=projectUrl(params.sb), anonKey=params.key;
  const api=makeClient({url,anonKey,getToken:()=>null});
  showMessage({title:"Please wait",text:"loading the study…"});
  if(!url||!anonKey||!params.run){showMessage({title:"Study unavailable",text:"This link is incomplete. Please contact the researcher."});return;}
  let rec=null;
  try{rec=await api.fetchDefinition(params.run);}
  catch(err){showMessage({title:"Connection problem",text:"The study could not be loaded ("+err.message+"). Please check your connection and reload this page.",button:"reload",onClick:()=>location.reload()});return;}
  if(!rec||!rec.active||!rec.definition){showMessage({title:"Study unavailable",text:"This study is not accepting participants at the moment. Please return the submission or contact the researcher."});return;}
  const def=rec.definition, settings=normalizeSettings(def.experiment.settings);
  const trials=buildTrialsFromRecords(def.records,settings);
  const minutes=Math.max(1,Math.round(trials.length*4/60));
  const dist=calib.distanceCm||DEFAULT_DISTANCE_CM;
  const intro=[def.instructions,`The session has ${trials.length} trial${trials.length===1?"":"s"} and takes about ${minutes} minute${minutes===1?"":"s"}.`+
    ` Please use a computer with a keyboard, sit about ${dist} cm from the screen (roughly an arm's length) and keep that distance throughout.`+
    (def.calibrate?" First you will be asked to hold a bank card against the screen so that the figures can be shown at their true size.":"")].filter(Boolean).join("\n\n");
  const pid=params.prolific_pid||params.participant||"online";
  const sessionId=(crypto.randomUUID?crypto.randomUUID():newSlug(32));
  const exp={id:def.experiment.id,n:def.experiment.n,name:def.experiment.name};
  const pending=[];let posting=Promise.resolve();
  const post=(trial,row)=>{posting=posting.then(()=>api.postTrial(sessionId,trial,row)).catch(()=>{pending.push({trial,row});});};
  async function flush(){
    await posting;
    for(let attempt=0;attempt<4&&pending.length;attempt++){
      if(attempt)await new Promise(r=>setTimeout(r,800*attempt));
      const retry=pending.splice(0);
      for(const p of retry){try{await api.postTrial(p.trial,p.row);}catch{pending.push(p);}}
    }
    return !pending.length;
  }
  async function finish(){
    $("thanksText").textContent="saving your responses…";$("thanksRow").hidden=true;
    let ok=await flush();
    if(ok){try{await api.completeSession(sessionId);}catch{ok=false;}}
    const target=completionTarget(def);
    if(!ok){
      $("thanksText").textContent="Some responses could not be saved. Please keep this window open and try again.";
      $("thanksRow").hidden=false;$("thanksBtn").textContent="try again";$("thanksBtn").onclick=finish;
      return;
    }
    $("thanksText").textContent="Thank you — your responses have been recorded."+(target?" You are being returned to Prolific…":" You may close this window.");
    if(target){
      $("thanksRow").hidden=false;$("thanksBtn").textContent="return to Prolific";$("thanksBtn").onclick=()=>{location.href=target;};
      setTimeout(()=>{location.href=target;},1800);
    }
  }
  const begin=async()=>{
    showMessage({title:"Please wait",text:"starting the session…"});
    try{
      await api.createSession({id:sessionId,experiment_id:params.run,
        participant:{prolific_pid:params.prolific_pid,study_id:params.study_id,session_id:params.session_id,participant:params.participant},
        calibration:{px_per_mm:calib.pxPerMm,calibrated:calib.calibrated,distance_cm:calib.distanceCm,screen:[screen.width,screen.height],
                     dpr:window.devicePixelRatio||1,viewport:[window.innerWidth,window.innerHeight]},
        user_agent:navigator.userAgent});
    }catch(err){
      showMessage({title:"Connection problem",text:"The session could not be started ("+err.message+"). Please check your connection and try again.",button:"try again",onClick:begin});
      return;
    }
    startRun({exp,trials,settings,participant:pid,canvas:def.canvas||"",mode:"participant",intro:"",instructions:"",
              onRow:(row,t)=>post(t.trial,row),onFinish:finish});
  };
  const afterInstructions=()=>{
    if(def.calibrate&&hooks&&hooks.calibrate){$("run").hidden=true;hooks.calibrate(()=>{$("run").hidden=false;begin();});}
    else begin();
  };
  showMessage({title:"Similarity judgement",text:intro,button:"continue",onClick:afterInstructions});
}

export function initCloud(opts){
  storage=opts.storage;toast=opts.toast||(()=>{});
  Object.assign(cfg,read(ONLINE_KEY,cfg));
  Object.assign(auth,read(AUTH_KEY,auth));
  Object.assign(ai,read(AI_KEY,ai));
  if(ai.mode!=="direct")ai.mode="supabase";
  // connections dialog
  $("connectClose").addEventListener("click",closeConnections);
  $("connectDone").addEventListener("click",closeConnections);
  $("connect").addEventListener("pointerdown",e=>{if(e.target===$("connect"))closeConnections();});
  ["sbUrl","sbKey"].forEach(id=>$(id).addEventListener("change",()=>{cfg.url=$("sbUrl").value.trim().replace(/\/+$/,"");cfg.anonKey=$("sbKey").value.trim();write(ONLINE_KEY,cfg);syncConnectForm();}));
  $("sbSignIn").addEventListener("click",signIn);
  $("sbPass").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();signIn();}});
  $("sbSignOut").addEventListener("click",()=>{clearAuth();syncConnectForm();toast("signed out");});
  document.querySelectorAll("input[name=aiMode]").forEach(r=>r.addEventListener("change",()=>{ai.mode=r.value;write(AI_KEY,ai);syncConnectForm();if(ai.mode==="direct")$("aiKey").focus();}));
  $("aiKey").addEventListener("change",()=>{ai.apiKey=$("aiKey").value.trim();write(AI_KEY,ai);syncConnectForm();});
  // publishing and results
  $("publishBtn").addEventListener("click",openPublish);
  $("republishBtn").addEventListener("click",openPublish);
  $("pubCancel").addEventListener("click",closePublish);
  $("pubGo").addEventListener("click",publish);
  $("publishDlg").addEventListener("pointerdown",e=>{if(e.target===$("publishDlg"))closePublish();});
  $("unpublishBtn").addEventListener("click",unpublish);
  $("fetchBtn").addEventListener("click",fetchResults);
  $("onlineCsv").addEventListener("click",()=>downloadOnline("csv"));
  $("onlineXlsx").addEventListener("click",()=>downloadOnline("xlsx"));
  $("copyLinkBtn").addEventListener("click",copyLink);
  $("onlineLink").addEventListener("focus",()=>$("onlineLink").select());
  window.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    if(!$("connect").hidden)closeConnections();
    else if(!$("publishDlg").hidden)closePublish();
  });
}
