/* Free text on the canvas — titles and notes. Double-click empty canvas to
   write one where you clicked, double-click a text to edit it; drag to move,
   Delete removes, shift-click chooses it with other things. Texts are
   annotations: saved with the canvas, never part of a stimulus, so runs,
   the PDF and the exports leave them out. */

import { $ } from "./dom.js";
import { texts, sel, view, nextId, findText, removeText, clearSelection } from "./state.js";
import { renderCanvas } from "./canvas.js";
import { showPanel, deselect } from "./console.js";
import { commit, commitSoon } from "./history.js";

export const TEXT_SIZE=18, TEXT_MIN=8, TEXT_MAX=120;
export const clampTextSize=v=>Math.max(TEXT_MIN,Math.min(TEXT_MAX,Math.round(+v)||TEXT_SIZE));
let editing=null;   // {t, fresh, before} while the inline editor is open

export function selectText(id){
  clearSelection();sel.tId=id;
  renderCanvas();openTextPanel();
}
export function openTextPanel(){
  const t=findText(sel.tId);
  if(!t){showPanel("createPanel");return;}
  $("textContent").value=t.text;$("noteSize").value=t.size;
  showPanel("textPanel");
}
export function deleteText(){
  if(sel.tId==null)return;
  removeText(sel.tId);
  deselect();commit();
}
/* a new text at a canvas point, straight into the editor */
export function newTextAt(x,y){
  const t={id:nextId(),x,y,text:"",size:TEXT_SIZE};
  texts.push(t);
  selectText(t.id);
  editText(t,true);
}
/* the inline editor: a textarea laid over the text, in the canvas's own scale */
export function editText(t,fresh=false){
  if(editing)finish(false);
  editing={t,fresh,before:t.text};
  const ed=$("textEdit");
  ed.value=t.text;ed.hidden=false;
  place();autosize();
  ed.focus();
}
function place(){
  const {t}=editing, ed=$("textEdit"), z=view.z;
  ed.style.left=`${view.tx+t.x*z-5}px`;
  ed.style.top=`${view.ty+(t.y-t.size)*z-3}px`;
  ed.style.fontSize=`${t.size*z}px`;
}
function autosize(){
  const ed=$("textEdit"), lines=ed.value.split("\n");
  ed.rows=Math.max(1,lines.length);
  ed.style.width=`${Math.max(6,...lines.map(l=>l.length))+2}ch`;
}
/* Enter or leaving the editor keeps the text; Escape puts the old one back; nothing written → no text */
function finish(cancel){
  if(!editing)return;
  const {t,fresh,before}=editing;
  editing=null;
  const ed=$("textEdit");
  const text=(cancel?before:ed.value).replace(/\s+$/,"");
  ed.hidden=true;
  if(!text.trim()){
    removeText(t.id);
    if(sel.tId===t.id)deselect();else renderCanvas();
    if(!fresh)commit();
  }else{
    t.text=text;
    renderCanvas();
    if(sel.tId===t.id)openTextPanel();
    if(fresh||text!==before)commit();
  }
}
export function textEditing(){return !!editing;}
export function initTexts(){
  const ed=$("textEdit");
  ed.addEventListener("keydown",e=>{
    if(e.key==="Escape"){e.preventDefault();finish(true);}
    else if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();finish(false);}   // shift+Enter: a new line
    e.stopPropagation();   // the canvas's own shortcuts stay out of it
  });
  ed.addEventListener("input",autosize);
  ed.addEventListener("blur",()=>finish(false));
  ed.addEventListener("pointerdown",e=>e.stopPropagation());
  $("textContent").addEventListener("input",()=>{
    const t=findText(sel.tId);if(!t)return;
    t.text=$("textContent").value;renderCanvas();commitSoon();
  });
  $("noteSize").addEventListener("input",()=>{
    const t=findText(sel.tId);if(!t)return;
    const v=parseInt($("noteSize").value);if(isNaN(v))return;
    t.size=clampTextSize(v);renderCanvas();commitSoon();
  });
}
