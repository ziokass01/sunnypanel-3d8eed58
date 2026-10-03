type Tone='success'|'danger'|'warning'|'info'|'neutral';
export function logStatus(row:Record<string,any>):{tone:Tone;label:string}{
 const label=String(row.action||row.event_type||row.event_code||row.transaction_type||'EVENT'),action=label.toUpperCase(),detail=row.detail||row.meta||row.details||{};
 const values=[row.ok,row.success,detail.ok,detail.success],result=String(row.status||detail.status||detail.result||'').toUpperCase();
 if(action==='VERIFY')return values.some(v=>v===false||v==='false')?{label:'FAILED',tone:'danger'}:{label:'VERIFY',tone:'success'};
 if(values.some(v=>v===false||v==='false')||/FAIL|ERROR|DENIED|INVALID|BLOCK|REJECT|EXPIRED/.test(action+' '+result))return {label,tone:'danger'};
 if(/WARN|ABNORMAL|SUSPICIOUS|RATE_LIMIT|ABUSE|PENDING|RETRY/.test(action+' '+result))return {label,tone:'warning'};
 if(/RESET|UPDATE|EDIT/.test(action))return {label,tone:'info'};
 if(/TRASH|DELETE|REMOVE|DISABLE/.test(action))return {label,tone:'warning'};
 if(/VERIFY|LOGIN|CHECK|SUCCESS|RESTORE|ENABLE|CREATE|RENEW/.test(action)||values.some(v=>v===true||v==='true'))return {label,tone:'success'};
 return {label,tone:'neutral'};
}
