/* Minimal ZIP writer (store method, no compression) — enough to hand the
   experimenter one download with many stimulus files. Pure. */

const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes){
  let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++)c=CRC[(c^bytes[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
const enc=new TextEncoder();
function dosTime(d){return ((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF;}
function dosDate(d){return (((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;}

/* files: [{name, data: Uint8Array|string}] → Uint8Array of the archive */
export function buildZip(files,now=new Date()){
  const parts=[], central=[];
  let offset=0;
  const time=dosTime(now), date=dosDate(now);
  for(const f of files){
    const name=enc.encode(f.name);
    const data=typeof f.data==="string"?enc.encode(f.data):f.data;
    const crc=crc32(data);
    const local=new DataView(new ArrayBuffer(30));
    local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0x0800,true);
    local.setUint16(8,0,true);local.setUint16(10,time,true);local.setUint16(12,date,true);
    local.setUint32(14,crc,true);local.setUint32(18,data.length,true);local.setUint32(22,data.length,true);
    local.setUint16(26,name.length,true);local.setUint16(28,0,true);
    parts.push(new Uint8Array(local.buffer),name,data);
    const cd=new DataView(new ArrayBuffer(46));
    cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(8,0x0800,true);
    cd.setUint16(10,0,true);cd.setUint16(12,time,true);cd.setUint16(14,date,true);
    cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);
    cd.setUint16(28,name.length,true);cd.setUint16(30,0,true);cd.setUint16(32,0,true);
    cd.setUint16(34,0,true);cd.setUint16(36,0,true);cd.setUint32(38,0,true);cd.setUint32(42,offset,true);
    central.push(new Uint8Array(cd.buffer),name);
    offset+=30+name.length+data.length;
  }
  const cdSize=central.reduce((n,p)=>n+p.length,0);
  const eocd=new DataView(new ArrayBuffer(22));
  eocd.setUint32(0,0x06054b50,true);eocd.setUint16(4,0,true);eocd.setUint16(6,0,true);
  eocd.setUint16(8,files.length,true);eocd.setUint16(10,files.length,true);
  eocd.setUint32(12,cdSize,true);eocd.setUint32(16,offset,true);eocd.setUint16(20,0,true);
  const all=[...parts,...central,new Uint8Array(eocd.buffer)];
  const out=new Uint8Array(all.reduce((n,p)=>n+p.length,0));
  let o=0;for(const p of all){out.set(p,o);o+=p.length;}
  return out;
}
