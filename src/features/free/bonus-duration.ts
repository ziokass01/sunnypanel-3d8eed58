export function bonusDurationText(key:{duration_seconds:number;bonus_seconds?:number;bonus_active?:boolean}) {
 const base=Math.max(0,Number(key.duration_seconds)||0),extra=key.bonus_active?Math.max(0,Number(key.bonus_seconds)||0):0;
 const duration=(s:number)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);return [h?`${h} giờ`:'',m?`${m} phút`:'',sec?`${sec} giây`:''].filter(Boolean).join(' ')||'0 phút';};
 return key.bonus_active && extra===0?'Bonus':extra>0?`${duration(base)} + ${duration(extra)} = ${duration(Math.min(base+extra,90*86400))}`:'';
}
