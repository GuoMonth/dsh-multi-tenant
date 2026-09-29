const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=process.env.E_PRIVATE,evidence=process.env.E_EVIDENCE,namespace='dsh-mvp-e-platform-final';
const k=(args,input)=>execFileSync('kubectl',['--kubeconfig',process.env.KUBECONFIG,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const bob=JSON.parse(fs.readFileSync(evidence+'/browser.json')).users[1],session=JSON.parse(fs.readFileSync(evidence+'/lifecycle.json')).users[1].sessionId;
(async()=>{
 const browser=await chromium.launch({headless:true,args:[`--host-resolver-rules=MAP *.dsh-mvp-rc2.test ${process.env.E_NODE_ADDRESS}, MAP dsh-mvp-rc2.test ${process.env.E_NODE_ADDRESS}`,'--no-proxy-server']});
 const original=JSON.parse(k(['get','configmap','dsh-platform-config','-n',namespace,'-o','json'])).data;
 fs.writeFileSync(root+'/platform-config-before.json',JSON.stringify(original),{mode:0o600});
 async function reload(data,count){k(['patch','configmap','dsh-platform-config','-n',namespace,'--type=merge','-p',JSON.stringify({data})]);let ready=false;for(let i=0;i<120;i++){const n=k(['exec','-n',namespace,'deployment/dsh-platform','-c','platform','--','node','-e',"console.log(JSON.parse(require('node:fs').readFileSync('/config/config.json')).members.length)"]).trim();if(Number(n)===count){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'projected config update timeout');k(['exec','-n',namespace,'deployment/dsh-platform','-c','platform','--','node','-e',"process.kill(1,'SIGHUP')"]);}
 try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:root+'/bob-browser.json'}),page=await context.newPage();await page.goto(bob.origin);await page.getByRole('button',{name:'Settings',exact:true}).waitFor();
 await page.evaluate(sessionId=>new Promise((resolve,reject)=>{const s=new WebSocket('wss://'+location.host+'/api/remote.mux');window.revoked=false;s.onclose=()=>window.revoked=true;s.onopen=()=>s.send(JSON.stringify({type:'open',streamId:'revoke',endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));s.onmessage=e=>{const f=JSON.parse(e.data);if(f.type==='item'&&f.value?.type==='snapshot')resolve();};s.onerror=reject;setTimeout(()=>reject(Error('WS timeout')),15000);}),session);
 const config=JSON.parse(original['config.json']);config.members=config.members.filter(m=>m.owner.principalId!=='bob');await reload({'config.json':JSON.stringify(config)},1);await page.waitForFunction(()=>window.revoked);const response=await page.goto(bob.origin+'/api/settings/describe');assert.equal(response.status(),401);
 fs.writeFileSync(evidence+'/revocation.json',JSON.stringify({membershipReload:true,establishedNativeWebsocketClosed:true,newNativeHttpRejected:true,restoredForUserE2E:false},null,2));
 }finally{await reload(original,2);await browser.close();}
 const result={membershipReload:true,establishedNativeWebsocketClosed:true,newNativeHttpRejected:true,restoredForUserE2E:true};fs.writeFileSync(evidence+'/revocation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
