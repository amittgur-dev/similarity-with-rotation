export const $=id=>document.getElementById(id);
export function escapeXML(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
