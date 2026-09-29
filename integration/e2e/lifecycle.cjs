const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=process.env.E_PRIVATE,evidence=process.env.E_EVIDENCE,base='https://dsh-mvp-rc2.test';
const records=JSON.parse(fs.readFileSync(evidence+'/browser.json')).users;
const k=args=>execFileSync('kubectl',['--kubeconfig',process.env.KUBECONFIG,...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const rpc=(page,method,args)=>page.evaluate(async({method,args})=>{const r=await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'e-'+Date.now(),method,payload:{args}})});const b=await r.json();if(!r.ok||!b.result?.ok)throw Error(method+': '+JSON.stringify(b.result?.error));return b.result.value;},{method,args});
const follow=(page,sessionId)=>page.evaluate(sessionId=>new Promise((resolve,reject)=>{const s=new WebSocket('wss://'+location.host+'/api/remote.mux');window.eSocket=s;window.eSocketClosed=false;s.onclose=()=>{window.eSocketClosed=true;};const timer=setTimeout(()=>reject(Error('snapshot timeout')),15000);s.onopen=()=>s.send(JSON.stringify({type:'open',streamId:'e',endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));s.onmessage=e=>{const f=JSON.parse(e.data);if(f.streamId==='e'&&f.type==='item'&&f.value?.type==='snapshot'){clearTimeout(timer);resolve(true);}};s.onerror=()=>{clearTimeout(timer);reject(Error('WS rejected'));};}),sessionId);
(async()=>{
 const browser=await chromium.launch({headless:true,args:[`--host-resolver-rules=MAP *.dsh-mvp-rc2.test ${process.env.E_NODE_ADDRESS}, MAP dsh-mvp-rc2.test ${process.env.E_NODE_ADDRESS}`,'--no-proxy-server']});
 const result={users:[],negative:{},model:'not tested',externalTool:'not tested'};
 const save=()=>fs.writeFileSync(evidence+'/lifecycle.json',JSON.stringify(result,null,2));
 try{
  const contexts=[];
  for(const r of records){
   const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:root+'/'+r.name+'-browser.json'}),page=await context.newPage();contexts.push({context,page});
   await page.goto(r.origin);await page.getByRole('button',{name:'Settings',exact:true}).waitFor();
   const describe=await rpc(page,'settings/describe',{}),model=describe.namespaces.find(n=>n.ns==='llm-deepseek');
   await rpc(page,'settings/update',{ns:model.ns,patch:{baseURL:'https://api.deepseek.com/anthropic'},expectedRevision:model.revision});
   const {sessionId}=await rpc(page,'session/create',{request:{}});await follow(page,sessionId);
   const pods=JSON.parse(k(['get','pods','-n',r.instance.ref.namespace,'-o','json'])).items;assert.equal(pods.length,1);const pod=pods[0];
   const claims=JSON.parse(k(['get','pvc','-n',r.instance.ref.namespace,'-o','json'])).items;assert.equal(claims.length,1);assert.equal(claims[0].metadata.uid,r.instance.ref.data.uid);
   const path='/var/lib/dsh/data/workspace/e-'+r.name+'.txt',marker='persistent-'+r.name;
   k(['exec','-n',r.instance.ref.namespace,pod.metadata.name,'--','node','-e',`require('node:fs').writeFileSync(${JSON.stringify(path)},${JSON.stringify(marker)})`]);
   const record={name:r.name,sessionId,pvcUid:claims[0].metadata.uid,oldPodUid:pod.metadata.uid,nativeHttp:true,nativeWebsocketSnapshot:true,modelSettings:true,fileSeed:'administrator exec (not model/tool evidence)',resources:pod.spec.containers[0].resources};result.users.push(record);save();
  }
  const [alice,bob]=contexts;
  const portal=await alice.context.newPage();let response=await portal.goto(base+'/api/environments/'+records[1].id);assert.equal(response.status(),403);result.negative.crossOwnerControl=true;
  response=await portal.goto(records[1].origin+'/api/settings/describe');assert.equal(response.status(),401);result.negative.crossOwnerNative=true;
  async function operation(name){await portal.goto(base);const start=Date.now();const [res]=await Promise.all([portal.waitForNavigation({timeout:90000}),portal.getByRole('button',{name,exact:true}).click()]);return {status:res.status(),body:JSON.parse(await portal.locator('body').innerText()),ms:Date.now()-start};}
  const stop=await operation('Stop');assert.equal(stop.status,200,JSON.stringify(stop));assert.equal(stop.body.instance.state,'Stopped');await alice.page.waitForFunction(()=>window.eSocketClosed);result.users[0].stopMs=stop.ms;result.negative.stopClosesWebsocket=true;save();
  const started=await operation('Start stopped environment');assert.ok([200,202].includes(started.status),JSON.stringify(started));
  let state=started.body;const wakeStart=Date.now();for(let i=0;i<90&&state.instance?.state!=='Ready';i++){await portal.waitForTimeout(1000);await portal.goto(base+'/api/environments/'+records[0].id);state=JSON.parse(await portal.locator('body').innerText());}assert.equal(state.instance.state,'Ready');result.users[0].wakeReadyMs=Date.now()-wakeStart+started.ms;
  await portal.goto(base);await portal.getByRole('link',{name:'Open environment',exact:true}).click();await portal.getByRole('button',{name:'Settings',exact:true}).waitFor();
  async function retained(page){assert.ok((await rpc(page,'session/list',{_request:{}})).items.some(s=>s.sessionId===result.users[0].sessionId));const d=await rpc(page,'settings/describe',{});assert.equal(d.namespaces.find(n=>n.ns==='llm-deepseek').user.baseURL,'https://api.deepseek.com/anthropic');const p=JSON.parse(k(['get','pods','-n',records[0].instance.ref.namespace,'-o','json'])).items[0];assert.equal(k(['exec','-n',records[0].instance.ref.namespace,p.metadata.name,'--','cat','/var/lib/dsh/data/workspace/e-alice.txt']),'persistent-alice');assert.equal(JSON.parse(k(['get','pvc','data','-n',records[0].instance.ref.namespace,'-o','json'])).metadata.uid,result.users[0].pvcUid);return p;}
  const before=await retained(portal);result.users[0].stopStartRetained=true;save();
  k(['delete','pod',before.metadata.name,'-n',records[0].instance.ref.namespace,'--wait=false']);
  let replacement;for(let i=0;i<90;i++){await portal.waitForTimeout(1000);replacement=JSON.parse(k(['get','pods','-n',records[0].instance.ref.namespace,'-o','json'])).items.find(p=>p.metadata.uid!==before.metadata.uid&&p.status.conditions?.some(c=>c.type==='Ready'&&c.status==='True'));if(replacement)break;}assert.ok(replacement);
  await portal.reload();await portal.getByRole('button',{name:'Settings',exact:true}).waitFor();await retained(portal);await follow(portal,result.users[0].sessionId);result.users[0].podRebuildRetained=true;result.users[0].rebuiltPodUid=replacement.metadata.uid;save();
  const logout=await alice.context.newPage();await logout.goto(base);await Promise.all([logout.waitForNavigation(),logout.getByRole('button',{name:'Log out',exact:true}).click()]);await portal.waitForFunction(()=>window.eSocketClosed);result.negative.logoutClosesWebsocket=true;
  response=await portal.goto(records[0].origin+'/api/settings/describe');assert.equal(response.status(),401);result.negative.logoutRejectsHttp=true;
  assert.equal(await bob.page.evaluate(()=>window.eSocket.readyState),1);result.negative.otherUserUnaffected=true;save();console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
