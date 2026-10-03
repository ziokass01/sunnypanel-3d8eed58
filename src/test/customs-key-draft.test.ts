import {afterEach,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {customsKey} from '@/features/customs/customs-api';
afterEach(()=>vi.unstubAllGlobals());
it('manual Customs key is normalized and hashed without replacing its content',async()=>{vi.stubGlobal('crypto',webcrypto);const raw='TOOLA-'+'ABCDEF0123456789'.repeat(2);const k=await customsKey('TOOLA',' '+raw.toLowerCase()+' ');expect(k.raw).toBe(raw);const digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));expect(k.hash).toBe(Buffer.from(digest).toString('hex'));});
it('Generate produces compatible random keys and does not create a license',async()=>{vi.stubGlobal('crypto',webcrypto);const a=await customsKey('TOOLA'),b=await customsKey('TOOLA');expect(a.raw).toMatch(/^TOOLA-[A-F0-9]{32}$/);expect(a.raw).not.toBe(b.raw);});
it.each(['TOOLB-'+'A'.repeat(32),'TOOLA-short','TOOLA-'+'Z'.repeat(32),''])('invalid draft rejected: %s',async draft=>{vi.stubGlobal('crypto',webcrypto);await expect(customsKey('TOOLA',draft)).rejects.toThrow('Key Customs');});
