/* Screen calibration: how many CSS pixels make a millimetre on this screen.
   Measured against an ISO/IEC 7810 ID-1 card (a bank/credit card), which is
   85.60 × 53.98 mm everywhere in the world. Pure over an injected storage. */

export const CARD_MM={w:85.60,h:53.98};
export const CARD_RATIO=CARD_MM.h/CARD_MM.w;
export const NOMINAL_PX_PER_MM=96/25.4;   // CSS reference pixel; used until calibrated
export const CALIBRATION_KEY="stimulus-builder.calibration";

/* live calibration state used by the UI */
export const calib={pxPerMm:NOMINAL_PX_PER_MM,calibrated:false};

export function pxPerMmFromCardWidth(cardWidthPx){
  if(!(cardWidthPx>0))throw new Error("card width must be positive");
  return cardWidthPx/CARD_MM.w;
}
export function cardWidthPxFor(pxPerMm){return CARD_MM.w*pxPerMm;}
export function pxToMm(px,pxPerMm=calib.pxPerMm){return px/pxPerMm;}
export function mmToPx(mm,pxPerMm=calib.pxPerMm){return mm*pxPerMm;}
export function formatMm(mm){
  return (mm>=100?Math.round(mm):mm>=10?mm.toFixed(1):mm.toFixed(2))+" mm";
}

export function readCalibration(storage){
  if(!storage)return null;
  try{
    const raw=storage.getItem(CALIBRATION_KEY);
    if(!raw)return null;
    const c=JSON.parse(raw);
    if(!c||!(c.pxPerMm>0))return null;
    return c;
  }catch{return null;}
}
export function writeCalibration(storage,pxPerMm,extra={}){
  const rec={pxPerMm,when:new Date().toISOString(),...extra};
  storage.setItem(CALIBRATION_KEY,JSON.stringify(rec));
  return rec;
}
export function clearCalibration(storage){storage.removeItem(CALIBRATION_KEY);}

/* apply a stored record (or none) to the live state */
export function loadCalibration(storage){
  const c=readCalibration(storage);
  if(c){calib.pxPerMm=c.pxPerMm;calib.calibrated=true;}
  else{calib.pxPerMm=NOMINAL_PX_PER_MM;calib.calibrated=false;}
  return calib;
}
