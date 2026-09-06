/* Undo / redo as a stack of state snapshots. The app injects how to take a
   snapshot and how to restore one, so this module stays free of state and
   DOM (and testable). Snapshots are JSON strings; identical consecutive
   snapshots are not recorded. */

const MAX=200;
let snap=null, restore=null, onChange=null;
let past=[], future=[], current=null, timer=null;

export function initHistory(hooks){
  snap=hooks.snap;restore=hooks.restore;onChange=hooks.onChange||(()=>{});
  current=snap();past=[];future=[];
}
/* record the current state as a step (call after a completed edit) */
export function commit(){
  clearTimeout(timer);timer=null;
  const s=snap();
  if(s===current)return false;
  past.push(current);
  if(past.length>MAX)past.shift();
  current=s;future=[];
  onChange({undo:past.length,redo:0});
  return true;
}
/* record after a burst of small edits (typing, nudging) settles */
export function commitSoon(ms=350){
  clearTimeout(timer);
  timer=setTimeout(commit,ms);
}
export function undo(){
  if(timer)commit();
  if(!past.length)return false;
  future.push(current);
  current=past.pop();
  restore(current);
  onChange({undo:past.length,redo:future.length});
  return true;
}
export function redo(){
  if(timer)commit();
  if(!future.length)return false;
  past.push(current);
  current=future.pop();
  restore(current);
  onChange({undo:past.length,redo:future.length});
  return true;
}
/* a fresh baseline (new / opened canvas): nothing to undo */
export function resetHistory(){
  clearTimeout(timer);timer=null;
  current=snap();past=[];future=[];
  onChange({undo:0,redo:0,baseline:true});
}
export const canUndo=()=>past.length>0;
export const canRedo=()=>future.length>0;
