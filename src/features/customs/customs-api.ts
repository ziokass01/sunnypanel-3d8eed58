import { supabase } from "@/integrations/supabase/client";
export const customsDb=supabase as any;
export async function customsChecked(query:any){const {data,error}=await query;if(error)throw new Error(error.message);return data;}
export async function customsManage(action:string,signature:string,id:string|null=null,data:Record<string,unknown>={}){const r=await customsChecked(customsDb.rpc('customs_admin_manage',{p_action:action,p_signature:signature,p_id:id,p_data:data}));if(r?.ok!==true)throw new Error('Thao tác không hoàn tất');return r;}
export const CUSTOMS_API='https://sunny-customs-auth.mquyet399.workers.dev';
export async function customsPublic(action:'info'|'reset',key:string,turnstile_token?:string|null){
 const signature=key.slice(0,key.lastIndexOf('-'));const response=await fetch(`${CUSTOMS_API}/v1/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature,key,turnstile_token}),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok||result?.ok!==true)throw new Error(result?.code||'CUSTOMS_UNAVAILABLE');return result;
}
export async function customsKey(signature:string,input?:string){const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');const raw=input===undefined?signature+'-'+hex(crypto.getRandomValues(new Uint8Array(16))).toUpperCase():input.trim().toUpperCase();if(!/^[A-Z][A-Z0-9]{2,23}$/.test(signature)||!raw.startsWith(signature+'-')||!/^[A-F0-9]{32}$/.test(raw.slice(signature.length+1)))throw new Error('Key Customs phải có mã sản phẩm và 32 ký tự 0–9, A–F.');const hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))));return {raw,hash,hint:signature+'-…'+raw.slice(-6)};}
