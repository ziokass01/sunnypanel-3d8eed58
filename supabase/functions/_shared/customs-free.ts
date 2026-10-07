// @ts-nocheck
export async function issueCustomsFree(db,sess,keyType,closeSeconds){
 const signature=String(keyType?.key_signature||'').trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9]{2,23}$/.test(signature))throw Error('CUSTOMS_PRODUCT_INVALID');
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 const raw=signature+'-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 const {data,error}=await db.rpc('free_flow_issue_customs_saved',{p_raw_key:raw,p_session_id:sess.session_id,p_key_hash:hash,p_key_hint:signature+'-…'+raw.slice(-6),p_close_seconds:closeSeconds});
 if(error||data?.ok!==true)throw Error(error?.message||data?.code||'CUSTOMS_ISSUE_FAILED');
 return {key:raw,expires_at:data.expires_at,created_at:data.created_at,duration_seconds:data.duration_seconds,max_devices:data.max_devices,allow_reset:true,app_code:'customs',key_signature:signature,customs_key_id:data.id,reward_mode:'customs'};
}
