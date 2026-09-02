export const $=id=>document.getElementById(id);
export function escapeXML(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
