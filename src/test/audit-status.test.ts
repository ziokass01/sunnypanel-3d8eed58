import {describe,it,expect} from 'vitest';
import {logStatus,logDetail} from '@/features/audit/log-status';
describe('verify audit outcomes',()=>{
 it('server success stays green even with unrelated outer false',()=>expect(logStatus({action:'VERIFY',ok:false,detail:{ok:true}})).toEqual({label:'VERIFY',tone:'success'}));
 it('actual failure remains red and keeps reason',()=>{const r={action:'VERIFY',detail:{ok:false,reason:'TS_WINDOW'}};expect(logStatus(r)).toEqual({label:'FAILED',tone:'danger'});expect(logDetail(r).reason).toBe('TS_WINDOW');});
 it('legacy string JSON is parsed',()=>expect(logStatus({action:'VERIFY',detail:'{"ok":true}'}).tone).toBe('success'));
 it('missing or malformed evidence is unknown, not fabricated success',()=>{for(const detail of [null,{},'broken'])expect(logStatus({action:'VERIFY',detail}).tone).toBe('warning');});
 it('reset is distinct from verify',()=>expect(logStatus({action:'PUBLIC_RESET',detail:{ok:true}}).tone).toBe('info'));
});
