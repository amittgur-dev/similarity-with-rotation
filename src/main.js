/* Entry point: wires the modules to the page. */

import { tray, items, questions, view, clearSelection, bumpId } from "./state.js";
import { $ } from "./dom.js";
import { initCanvas, renderCanvas } from "./canvas.js";
import { initConsole, showPanel, createShape, makeVariant, deselect, duplicateSelected, deleteSelected, deleteMulti } from "./console.js";
import { makeQuestion, makeGroupVariation, ungroupQuestion, deleteQuestion, layoutQuestion } from "./questions.js";
import { addTrayItem, clearTrayDOM } from "./tray.js";
import { serializeCanvas, deserializeCanvas, canvasFileName, downloadJSON, readJSONFile } from "./io.js";

function saveCanvas(){
  const name=canvasFileName($("canvasName").value);
  downloadJSON(serializeCanvas({name,view,tray,items,questions}),name+".json");
}
async function loadCanvasFile(file){
  try{
    const loaded=deserializeCanvas(await readJSONFile(file));
    tray.length=0;items.length=0;questions.length=0;
    clearSelection();
    clearTrayDOM();
    loaded.tray.forEach(t=>{tray.push(t);addTrayItem(t);});
    items.push(...loaded.items);
    questions.push(...loaded.questions);
    bumpId(loaded.maxId);
    questions.forEach(q=>layoutQuestion(q));
    if(loaded.view)Object.assign(view,loaded.view);
    $("canvasName").value=loaded.name;
    renderCanvas();showPanel("createPanel");
  }catch(err){
    alert("Could not load canvas: "+err.message);
  }
}

const actions={
  save:saveCanvas,
  load:()=>$("loadFile").click(),
  create:createShape,
  makeVariant,
  deselect,
  duplicate:duplicateSelected,
  deleteSelected,
  makeQuestion,
  deleteMulti,
  makeGroupVariation,
  ungroup:ungroupQuestion,
  deleteQuestion
};
document.querySelectorAll("[data-action]").forEach(b=>{
  b.addEventListener("click",()=>actions[b.dataset.action]());
});
$("loadFile").addEventListener("change",e=>{
  const f=e.target.files[0];
  if(f)loadCanvasFile(f).then(()=>{e.target.value="";});
});

initConsole();
initCanvas();
$("shapeInput").focus();
