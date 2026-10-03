export type DurationUnit='minutes'|'hours'|'days';
export const durationFactors={minutes:60,hours:3600,days:86400};
export function convertDuration(value:number,from:DurationUnit,to:DurationUnit){return value*durationFactors[from]/durationFactors[to];}
export function durationSeconds(value:number,unit:DurationUnit){return Math.round(value*durationFactors[unit]);}
