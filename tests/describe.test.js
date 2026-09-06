import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequestBody, parsePlan, materializePlan, PLAN_SCHEMA, MODEL, requestPlanDirect } from "../src/describe.js";
import { parseShape, norm, BASE_R, Q_DX, Q_DY } from "../src/geometry.js";
import { questionTitle } from "../src/variants.js";
import { newExperiment, nextOrdinal } from "../src/experiment.js";
import { layoutQuestion } from "../src/questions.js";

test("request body: model, system, structured output, canvas context", ()=>{
  const b=buildRequestBody("  ten questions comparing frames ",{shapes:["square/diamond (screen)"],questions:2});
  assert.equal(b.model,MODEL);assert.equal(b.model,"claude-opus-5");
  assert.equal(b.output_config.format.type,"json_schema");assert.equal(b.output_config.format.schema,PLAN_SCHEMA);
  assert.ok(b.system.includes("vertex"));
  assert.ok(b.messages[0].content.startsWith("ten questions comparing frames"));
  assert.ok(b.messages[0].content.includes("square/diamond (screen)")&&b.messages[0].content.includes("2 question"));
  assert.ok(!("thinking" in b),"adaptive thinking is the model default");
});

test("parsePlan: text block JSON, refusal, empty", ()=>{
  const plan={experiment:{name:"x",rationale:""},shapes:[{key:"a",base:"square",sub:"diamond",frame:"screen",subRatio:0.18}],questions:[{shape:"a",A:{baseRot:0,subRot:0},B:{baseRot:45,subRot:45},C:{baseRot:0,subRot:45},note:""}],settings:{repeats:1,shuffle:true,swapSides:true,fixation:true}};
  assert.deepEqual(parsePlan({content:[{type:"text",text:JSON.stringify(plan)}],stop_reason:"end_turn"}),plan);
  assert.throws(()=>parsePlan({content:[],stop_reason:"refusal",stop_details:{explanation:"no"}}),/declined: no/);
  assert.throws(()=>parsePlan({content:[{type:"text",text:'{"shapes":[],"questions":[]}'}]}),/no questions/);
});

test("direct call: headers and error surfacing", async ()=>{
  let seen;
  const ok=await requestPlanDirect({model:MODEL},"sk-test",async(url,init)=>{seen={url,init};return {ok:true,json:async()=>({content:[{type:"text",text:JSON.stringify({shapes:[{}],questions:[{}]})}]})};});
  assert.equal(seen.url,"https://api.anthropic.com/v1/messages");
  assert.equal(seen.init.headers["x-api-key"],"sk-test");assert.equal(seen.init.headers["anthropic-version"],"2023-06-01");
  assert.equal(seen.init.headers["anthropic-dangerous-direct-browser-access"],"true");
  assert.ok(ok.questions.length);
  await assert.rejects(()=>requestPlanDirect({},"k",async()=>({ok:false,status:401,statusText:"x",json:async()=>({error:{message:"invalid x-api-key"}})})),/invalid x-api-key/);
});

test("materializePlan: shapes dedupe, questions laid out, experiment created, problems reported", ()=>{
  const tray=[],items=[],questions=[],experiments=[];let id=1;
  const ctx={tray,items,questions,experiments,nextId:()=>id++,parseShape,norm,layoutQuestion:q=>layoutQuestion(q,items),questionTitle,newExperiment,nextOrdinal,BASE_R,Q_DX,Q_DY,origin:{x:100,y:200}};
  const plan={experiment:{name:"frame test",rationale:"why"},
    shapes:[{key:"sq",base:"square",sub:"diamond",frame:"screen",subRatio:0.18},{key:"sq2",base:"square",sub:"diamond",frame:"screen",subRatio:0.18},
            {key:"hx",base:"hexagon",sub:"none",frame:"vertex",subRatio:0.18},{key:"bad",base:"blob",sub:"diamond",frame:"screen",subRatio:0.18}],
    questions:[{shape:"sq",A:{baseRot:0,subRot:0},B:{baseRot:45,subRot:45},C:{baseRot:0,subRot:45},note:"whole vs subs"},
               {shape:"sq2",A:{baseRot:10,subRot:0},B:{baseRot:400,subRot:0},C:{baseRot:-30,subRot:0},note:""},
               {shape:"hx",A:{baseRot:0,subRot:0},B:{baseRot:30,subRot:0},C:{baseRot:60,subRot:0},note:"solid"},
               {shape:"bad",A:{baseRot:0,subRot:0},B:{baseRot:0,subRot:0},C:{baseRot:0,subRot:0},note:""}],
    settings:{repeats:2,shuffle:false,swapSides:true,fixation:false}};
  const r=materializePlan(plan,ctx);
  assert.equal(tray.length,2,"identical constructions share one tray entry");
  assert.equal(r.questions.length,3);assert.equal(items.length,9);
  assert.deepEqual(r.problems,["unknown base shape “blob”","question 4 references unknown shape “bad”"]);
  assert.equal(r.experiment.name,"frame test");assert.deepEqual(r.experiment.questions,r.questions.map(q=>q.id));
  assert.deepEqual(r.experiment.settings,{repeats:2,shuffle:false,swapSides:true,fixation:false,fullscreen:true});
  assert.ok(r.questions[0].title.startsWith("Q1 · square/diamond · A(0,0) B(45,45) C(0,45) · whole vs subs"));
  assert.equal(items.find(i=>i.id===r.questions[1].b).baseRot,40,"rotations normalised");
  assert.equal(r.questions[0].cx,100);assert.equal(r.questions[1].cx,100+2*BASE_R*Q_DX+BASE_R*2.4);
  assert.equal(r.questions[2].cy,200,"three per row");
  assert.ok(items.every(i=>i.qId!=null&&i.label));
});
