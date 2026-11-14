export type BonusKey = {duration_seconds:number;bonus_active?:boolean;bonus_seconds?:number};
export function bonusTime(seconds:number) {const s=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return [h?`${h} giờ`:'',m?`${m} phút`:''].filter(Boolean).join(' ')||'0 phút';}
export function bonusPresentation(key:BonusKey) {
 if(!key.bonus_active)return null;
 const base=Math.max(0,Number(key.duration_seconds)||0),extra=Math.max(0,Number(key.bonus_seconds)||0);
 return {tag:extra?`+${bonusTime(extra)}`:'Bonus',extra:extra?bonusTime(extra):null,base:bonusTime(base),total:bonusTime(Math.min(base+extra,90*86400))};
}
export function orderedFreeKeys<T extends {sort_order?:number|null}>(rows:T[]):T[]{
 if(!rows.every(r=>typeof r.sort_order==='number'&&Number.isFinite(r.sort_order)))return [...rows];
 return rows.map((row,index)=>({row,index})).sort((a,b)=>a.row.sort_order!-b.row.sort_order!||a.index-b.index).map(x=>x.row);
}
