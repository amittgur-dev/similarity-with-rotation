import { test } from "node:test";
import assert from "node:assert/strict";
import { newSlug, participantLink, projectUrl, prolificParams, completionTarget, sessionsToRows, makeClient, OnlineError } from "../src/online.js";

test("slugs, links and Prolific parameters", ()=>{
  const seq=[0.1,0.5,0.9,0.2];let i=0;
  assert.equal(newSlug(4,()=>seq[i++%4]),"ds6g");
  assert.equal(participantLink("https://x.github.io/app/index.html?foo=1#h","ab cd"),"https://x.github.io/app/index.html?run=ab+cd");
  assert.equal(participantLink("https://x.github.io/app/","q1"),"https://x.github.io/app/?run=q1");
  assert.equal(participantLink("https://x.github.io/app/","q1",{url:"https://abcdefgh.supabase.co/",anonKey:"K.1"}),"https://x.github.io/app/?run=q1&sb=abcdefgh&key=K.1");
  assert.equal(participantLink("https://x.github.io/app/","q1",{url:"https://db.example.org",anonKey:"K"}),"https://x.github.io/app/?run=q1&sb=https%3A%2F%2Fdb.example.org&key=K");
  assert.equal(projectUrl("abcdefgh"),"https://abcdefgh.supabase.co");
  assert.equal(projectUrl("https://db.example.org"),"https://db.example.org");
  assert.deepEqual(prolificParams("?run=q1&sb=abc&key=K&PROLIFIC_PID=p&STUDY_ID=s&SESSION_ID=z"),{run:"q1",sb:"abc",key:"K",prolific_pid:"p",study_id:"s",session_id:"z",participant:""});
  assert.equal(completionTarget({completionUrl:"https://app.prolific.com/submissions/complete?cc=ABC"}),"https://app.prolific.com/submissions/complete?cc=ABC");
  assert.equal(completionTarget({completionCode:"C1 2"}),"https://app.prolific.com/submissions/complete?cc=C1%202");
  assert.equal(completionTarget({}),"");
});

test("sessions with embedded trials flatten into ordered rows", ()=>{
  const rows=sessionsToRows([{id:"s1",created_at:"t",completed:true,participant:{prolific_pid:"p1"},trials:[{trial:2,row:{response:"C"}},{trial:1,row:{response:"B"}}]},
                             {id:"s2",created_at:"t2",completed:false,participant:{},trials:[]}]);
  assert.deepEqual(rows.map(r=>[r.session_id,r.response,r.prolific_pid,r.session_completed]),[["s1","B","p1",1],["s1","C","p1",1]]);
});

test("REST client: headers, auth, errors, embedded results", async ()=>{
  const calls=[];
  const fetch=async(url,init)=>{calls.push({url,init});
    if(url.includes("/auth/v1/token"))return {ok:true,status:200,text:async()=>JSON.stringify({access_token:"jwt",refresh_token:"r",expires_in:3600,user:{email:"e@x"}})};
    if(url.includes("sessions?experiment_id"))return {ok:true,status:200,text:async()=>JSON.stringify([{id:"s1",trials:[]}])};
    if(url.includes("published_experiments?id=eq."))return {ok:true,status:200,text:async()=>"[]"};
    if(url.endsWith("/rest/v1/trials"))return {ok:false,status:401,statusText:"Unauthorized",text:async()=>JSON.stringify({message:"new row violates row-level security policy"})};
    return {ok:true,status:201,text:async()=>JSON.stringify([{id:"new"}])};
  };
  let token=null;
  const c=makeClient({url:"https://p.supabase.co/",anonKey:"anon",fetch,getToken:()=>token});
  const auth=await c.signIn("e@x","pw");assert.equal(auth.access_token,"jwt");
  assert.equal(calls[0].url,"https://p.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(calls[0].init.headers.Authorization,"Bearer anon","no session yet");
  token="jwt";
  const pub=await c.publish({id:"q1"});assert.equal(pub.id,"new");
  assert.equal(calls[1].init.headers.Authorization,"Bearer jwt");assert.equal(calls[1].init.headers.Prefer,"return=representation");
  assert.equal(await c.fetchDefinition("nope"),null);
  assert.equal(calls[2].init.headers.Authorization,"Bearer anon","participant calls never carry the experimenter token");
  const s=await c.fetchSessions("q1");assert.equal(s[0].id,"s1");
  await assert.rejects(()=>c.postTrial("s1",1,{}),e=>e instanceof OnlineError&&e.status===401&&/row-level security/.test(e.message));
  // a session is inserted with a caller-made id and nothing is read back (participants have no select right)
  const sess=await c.createSession({id:"u-1",experiment_id:"q1"});assert.equal(sess.id,"u-1");
  const last=calls[calls.length-1];assert.equal(last.init.headers.Prefer,"return=minimal");assert.equal(last.init.headers.Authorization,"Bearer anon");
});
