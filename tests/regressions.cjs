const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('dist/app.js','utf8'),product=fs.readFileSync('dist/product.js','utf8'),auth=fs.readFileSync('dist/auth.js','utf8');
const values=new Map(),listeners={};
const ctx=vm.createContext({structuredClone,Date,Event,console,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},window:{dispatchEvent:e=>listeners[e.type]?.(),addEventListener:(k,fn)=>listeners[k]=fn},render(){},updateSidebar(){},showToast(){}});
vm.runInContext(app.slice(0,app.indexOf('function uid')),ctx);
vm.runInContext(`let focusRun={},cncTimer={},cncView={},learningSubjectId=null,selectedDay='';function todayISO(){return '2026-09-16'};`+product.slice(product.indexOf('function restoreRuntimeState'),product.indexOf("window.addEventListener('prepago:pause-timers'")),ctx);
vm.runInContext(`window.PrepagoState.useUser('account-a');window.PrepagoState.replace({tasks:[{id:'a'}],focusRun:{running:true,left:80,segments:{'2026-09-16':20}},cnc:{papers:{private:{notes:'Private A'}},timer:{running:true,paperId:'private'}}});`,ctx);
assert.equal(vm.runInContext('focusRun.running',ctx),true);
vm.runInContext("window.PrepagoState.useUser('account-b')",ctx);
assert.equal(vm.runInContext('state.tasks.length',ctx),0,'A tasks leaked into B');
assert.equal(vm.runInContext('focusRun.running',ctx),false,'A focus timer leaked into B');
assert.equal(vm.runInContext('cncTimer.running',ctx),false,'A CNC timer leaked into B');
assert.equal(vm.runInContext('Object.keys(state.cnc.papers).length',ctx),0,'A notes leaked into B');
vm.runInContext("window.PrepagoState.useUser('account-a')",ctx);
assert.equal(vm.runInContext('state.tasks[0].id',ctx),'a','Account A cache was lost');
vm.runInContext(auth.slice(auth.indexOf('function profileHasAccess'),auth.indexOf('function updateTrialBadge')),ctx);
const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
for(const [status,ends,expected] of [['inactive',future,false],['trial',future,true],['promo',future,true],['active',future,true],['expired',future,false],['cancelled',future,false],['promo',null,false],['promo',past,false],['active',past,false],['active',null,true]]){
 ctx.p={subscription_status:status,subscription_ends_at:ends,trial_ends_at:ends};assert.equal(vm.runInContext('profileHasAccess(p)',ctx),expected,status);
}
console.log('PASS: account isolation, timer isolation, cache retention, and 10 subscription status/expiry cases');
