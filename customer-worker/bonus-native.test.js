import test from 'node:test';import assert from 'node:assert/strict';import {resolveFreeBonus,sortKeyTypesForBonus,effectiveBonusDuration,publicFreeBonus} from './free-shared/bonus.js';
const cfg={enabled:true,start_time:'20:00',end_time:'22:00',rules:[{key_type_code:'ff10',app_code:'free-fire',enabled:true,apply_bonus:true,replace_same_app:true,bonus_only:true,bonus_seconds:7200},{key_type_code:'ff20',app_code:'free-fire',enabled:true,apply_bonus:true,replace_same_app:true,bonus_only:true,bonus_seconds:14400},{key_type_code:'tool',app_code:'customs',enabled:true,apply_bonus:true,replace_same_app:true,bonus_only:true,bonus_seconds:18000}]};
const rows=[{code:'tool',sort_order:60,enabled:true},{code:'ff20',sort_order:20,enabled:true},{code:'ff10',sort_order:10,enabled:true},{code:'kernel',sort_order:30,enabled:true},{code:'disabled',sort_order:0,enabled:false}];
const run=time=>resolveFreeBonus(cfg,new Date(time));
for(const time of ['2026-11-14T12:59:59Z','2026-11-14T13:00:00Z','2026-11-14T14:59:59Z','2026-11-14T15:00:00Z'])test('all enabled products stay visible at '+time,()=>assert.deepEqual(sortKeyTypesForBonus(rows,run(time)).map(x=>x.code),['ff10','ff20','kernel','tool']));
test('two FF durations and a custom product add their own hours',()=>{const r=run('2026-11-14T14:00:00Z');for(const [code,base,extra] of [['ff10',36000,7200],['ff20',72000,14400],['tool',18000,18000]])assert.equal(effectiveBonusDuration(base,r,code).effective_seconds,base+extra);});
test('end boundary restores base duration, not an empty key list',()=>{const r=run('2026-11-14T15:00:00Z');assert.equal(r.active,false);assert.equal(effectiveBonusDuration(36000,r,'ff10').effective_seconds,36000);assert.equal(sortKeyTypesForBonus(rows,r).length,4);});
test('global off restores all enabled products with zero bonus',()=>{const r=resolveFreeBonus({...cfg,enabled:false});assert.equal(sortKeyTypesForBonus(rows,r).length,4);assert.equal(effectiveBonusDuration(36000,r,'ff10').bonus_seconds,0);});
test('disabled per-key switch retains hours without granting them',()=>{const r=resolveFreeBonus({...cfg,start_time:'00:00',end_time:'00:00',rules:[{key_type_code:'ff10',enabled:false,apply_bonus:true,replace_same_app:true,bonus_seconds:7200}]});assert.equal(effectiveBonusDuration(36000,r,'ff10').bonus_seconds,0);assert.equal(sortKeyTypesForBonus(rows,r).length,4);});
test('legacy hidden flags no longer hide products or emit replacement status',()=>{const r=run('2026-11-14T14:00:00Z');assert.ok(publicFreeBonus(r).rules.every(x=>!x.bonus_only&&!x.replace_same_app));});
test('cross midnight schedule adds bonus only inside its window',()=>{const c={...cfg,start_time:'22:00',end_time:'06:00'};assert.equal(resolveFreeBonus(c,new Date('2026-11-14T16:00:00Z')).active,true);assert.equal(resolveFreeBonus(c,new Date('2026-11-14T23:00:00Z')).active,false);});

test('explicit bonus-only key appears in window and hides outside, ordinary keys stay',()=>{
 const c={...cfg,rules:[...cfg.rules,{key_type_code:'scheduled',enabled:true,visibility_mode:'bonus_only',bonus_seconds:0}]};
 const list=[...rows,{code:'scheduled',sort_order:70,enabled:true}];
 for(const [time,count] of [['2026-11-14T12:59:59Z',4],['2026-11-14T13:00:00Z',5],['2026-11-14T15:00:00Z',4]])assert.equal(sortKeyTypesForBonus(list,resolveFreeBonus(c,new Date(time))).length,count);
 assert.equal(sortKeyTypesForBonus(list,resolveFreeBonus({...c,enabled:false})).length,4);
});
test('disabled product stays disabled even with bonus-only mode selected',()=>{
 const rt=resolveFreeBonus({...cfg,start_time:'00:00',end_time:'00:00',rules:[{key_type_code:'disabled',enabled:true,visibility_mode:'bonus_only',bonus_seconds:7200}]});assert.ok(!sortKeyTypesForBonus(rows,rt).some(x=>x.code==='disabled'));
});
test('disabling per-key Bonus hides its scheduled-only key but never ordinary keys',()=>{
 const rt=resolveFreeBonus({...cfg,start_time:'00:00',end_time:'00:00',rules:[{key_type_code:'ff10',enabled:false,visibility_mode:'bonus_only',bonus_seconds:7200},{key_type_code:'ff20',enabled:false,visibility_mode:'always',bonus_seconds:14400}]});assert.deepEqual(sortKeyTypesForBonus(rows,rt).map(x=>x.code),['ff20','kernel','tool']);
});
