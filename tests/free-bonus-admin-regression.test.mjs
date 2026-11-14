import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/pages/AdminFreeKeys.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('AdminFreeKeys.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let code;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='setBonusReplacementKey')code=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const js=ts.transpileModule('const toggle='+code+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('actual admin handler allows two same-app bonus switches; turning one off preserves the other and retained hours',()=>{
 let state=[{key_type_code:'ff_h10',app_code:'free-fire',bonus_seconds:7200,replace_same_app:false,apply_bonus:false},{key_type_code:'ff_h20',app_code:'free-fire',bonus_seconds:14400,replace_same_app:false,apply_bonus:false}];
 const toggle=new Function('setBonusRules','keyTypesQuery',js+'return toggle;')(f=>state=f(state),{data:state.map(x=>({code:x.key_type_code,app_code:x.app_code}))});
 toggle('ff_h10',true);toggle('ff_h20',true);assert.ok(state.every(x=>x.replace_same_app&&x.apply_bonus));toggle('ff_h10',false);assert.equal(state[0].apply_bonus,false);assert.equal(state[0].bonus_seconds,7200);assert.equal(state[1].apply_bonus,true);
});
test('Worker JS, native TS and Edge bonus helpers have identical logic',()=>{
 const r=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,r),'utf8');assert.equal(read('customer-worker/free-shared/bonus.js'),read('customer-worker/free-shared/bonus.ts'));assert.equal(read('customer-worker/free-shared/bonus.js'),read('supabase/functions/_shared/free-bonus.ts'));
});
