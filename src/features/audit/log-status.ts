type Tone='success'|'danger'|'warning'|'info'|'neutral';
export function logDetail(row:Record<string,any>):Record<string,any>{const raw=row.detail??row.meta??row.details;try{const d=typeof raw==='string'?JSON.parse(raw):raw;return d&&typeof d==='object'&&!Array.isArray(d)?d:{};}catch{return {};}}
export function logStatus(row:Record<string,any>):{tone:Tone;label:string}{
 const label=String(row.action||row.event_type||row.event_code||row.transaction_type||'EVENT'),action=label.toUpperCase(),detail=logDetail(row);
 const outcome=detail.ok??detail.success??row.ok??row.success,result=String(detail.status??detail.result??row.status??'').toUpperCase();
 if(action==='VERIFY'){if(outcome===false||outcome==='false')return {label:'FAILED',tone:'danger'};if(outcome===true||outcome==='true')return {label:'VERIFY',tone:'success'};return {label:'VERIFY · Chưa rõ kết quả',tone:'warning'};}
 if(outcome===false||outcome==='false'||/FAIL|ERROR|DENIED|INVALID|BLOCK|REJECT|EXPIRED/.test(action+' '+result))return {label,tone:'danger'};
 if(/WARN|ABNORMAL|SUSPICIOUS|RATE_LIMIT|ABUSE|PENDING|RETRY/.test(action+' '+result))return {label,tone:'warning'};
 if(/RESET|UPDATE|EDIT/.test(action))return {label,tone:'info'};
 if(/TRASH|DELETE|REMOVE|DISABLE/.test(action))return {label,tone:'warning'};
 if(/LOGIN|CHECK|SUCCESS|RESTORE|ENABLE|CREATE|RENEW/.test(action)||outcome===true||outcome==='true')return {label,tone:'success'};
 return {label,tone:'neutral'};
}
