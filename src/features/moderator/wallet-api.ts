import {supabase} from '@/integrations/supabase/client';
export async function walletRpc(name:string,args:Record<string,unknown>={}){const {data,error}=await (supabase as any).rpc(name,args);if(error){const e=new Error(error.message) as Error&{rejected:boolean};e.rejected=!!error.code&&!String(error.message).includes('Failed to fetch');throw e;}return data;}
export async function walletBalance(){const {data,error}=await (supabase as any).from('moderator_wallets').select('balance').maybeSingle();if(error)throw error;return Number(data?.balance||0);}
