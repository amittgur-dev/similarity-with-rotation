import { test } from "node:test";
import assert from "node:assert/strict";
import { initHistory, commit, commitSoon, undo, redo, resetHistory, canUndo, canRedo } from "../src/history.js";

function harness(){
  const state={v:0};
  const events=[];
  initHistory({snap:()=>JSON.stringify(state),restore:s=>Object.assign(state,JSON.parse(s)),onChange:e=>events.push(e)});
  return {state,events};
}

test("commit records distinct states; undo/redo walk them; identical states are skipped", ()=>{
  const {state}=harness();
  assert.equal(commit(),false,"nothing changed");
  state.v=1;assert.equal(commit(),true);
  state.v=2;commit();
  assert.ok(canUndo());assert.ok(!canRedo());
  undo();assert.equal(state.v,1);
  undo();assert.equal(state.v,0);
  assert.equal(undo(),false);
  redo();assert.equal(state.v,1);
  assert.ok(canRedo());
  state.v=5;commit();          // a new edit drops the redo branch
  assert.ok(!canRedo());
  undo();assert.equal(state.v,1);
});

test("commitSoon coalesces a burst and is flushed by undo", async ()=>{
  const {state}=harness();
  state.v=1;commitSoon(20);state.v=2;commitSoon(20);
  await new Promise(r=>setTimeout(r,40));
  undo();assert.equal(state.v,0,"one step for the whole burst");
  redo();assert.equal(state.v,2);
  state.v=3;commitSoon(1000);
  undo();assert.equal(state.v,2,"pending burst is committed before undoing");
});

test("resetHistory sets a new baseline", ()=>{
  const {state,events}=harness();
  state.v=1;commit();
  resetHistory();
  assert.ok(!canUndo());
  assert.equal(events.at(-1).baseline,true);
});
