/* The in-browser canvas library: named canvases kept in localStorage so
   they can be reopened from the app itself. File export stays the
   canonical, shareable format — the library holds the same JSON.

   Pure over an injected Storage-like object ({getItem,setItem,removeItem})
   so it is testable without a browser. */

export const LIBRARY_KEY="stimulus-builder.library";
export const LIBRARY_VERSION=1;

function empty(){return {version:LIBRARY_VERSION,canvases:{}};}

export function readLibrary(storage){
  if(!storage)return empty();
  try{
    const raw=storage.getItem(LIBRARY_KEY);
    if(!raw)return empty();
    const lib=JSON.parse(raw);
    if(!lib||typeof lib!=="object"||!lib.canvases||typeof lib.canvases!=="object")return empty();
    return lib;
  }catch{
    return empty();
  }
}
function writeLibrary(storage,lib){
  storage.setItem(LIBRARY_KEY,JSON.stringify(lib));
}

/* most recently saved first */
export function listCanvases(storage){
  const lib=readLibrary(storage);
  return Object.entries(lib.canvases)
    .map(([name,e])=>({name,savedAt:e.savedAt||""}))
    .sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.name.localeCompare(b.name));
}
export function saveToLibrary(storage,name,data,now=new Date()){
  const n=name.trim();
  if(!n)throw new Error("a canvas needs a name");
  const lib=readLibrary(storage);
  lib.canvases[n]={savedAt:now.toISOString(),data};
  writeLibrary(storage,lib);
  return n;
}
export function loadFromLibrary(storage,name){
  const e=readLibrary(storage).canvases[name];
  return e?e.data:null;
}
export function removeFromLibrary(storage,name){
  const lib=readLibrary(storage);
  if(!(name in lib.canvases))return false;
  delete lib.canvases[name];
  writeLibrary(storage,lib);
  return true;
}
