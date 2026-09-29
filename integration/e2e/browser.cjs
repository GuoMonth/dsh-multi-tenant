// Actual Dex + platform + native RC probe. No model or external-tool call is asserted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const users=JSON.parse(fs.readFileSync(process.env.E_PRIVATE+'/users.json'));
const base='https://dsh-mvp-rc2.test';
(async()=>{
 const browser=await chromium.launch({headless:true,args:[`--host-resolver-rules=MAP *.dsh-mvp-rc2.test ${process.env.E_NODE_ADDRESS}, MAP dsh-mvp-rc2.test ${process.env.E_NODE_ADDRESS}`,'--no-proxy-server']});
 const result={fixtureIdP:'Dex v2.45.1',model:'not tested: credentials unavailable',externalTool:'not tested: authorization unavailable',users:[]};
 try{
  for(const user of users){
   const context=await browser.newContext({ignoreHTTPSErrors:true,locale:'en-US'}),page=await context.newPage();
   page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).host==='dsh-mvp-rc2.test')console.log(JSON.stringify({postPath:new URL(r.url()).pathname,origin:r.headers().origin,fetchSite:r.headers()['sec-fetch-site']}));});
   await page.goto(base+'/auth/login');
   if(await page.getByText('Log in with Email').count())await page.getByText('Log in with Email').click();
   await page.locator('input[name="login"]').fill(user.email);
   await page.locator('input[name="password"]').fill(user.password);
   await page.locator('button[type="submit"]').click();
   await page.getByRole('heading',{name:'Your environments'}).waitFor();
   const action=await page.locator('form[action^="/api/environments/"]').first().getAttribute('action');
   const started=Date.now();
   const invoke=async method=>{let r;if(method==='GET')r=await page.goto(base+action);else [r]=await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'Enter / create',exact:true}).click()]);return {status:r.status(),body:JSON.parse(await page.locator('body').innerText())};};
   let response=await invoke('POST');
   assert.ok([200,202].includes(response.status),JSON.stringify(response));
   for(let i=0;i<90&&response.body.instance?.state!=='Ready';i++){await page.waitForTimeout(1000);response=await invoke('GET');}
   assert.equal(response.body.instance.state,'Ready',JSON.stringify(response));
   const record={name:user.name,id:response.body.id,instance:response.body.instance,coldReadyMs:Date.now()-started};
   await page.goto(base);await page.getByRole('link',{name:'Open environment',exact:true}).click();
   await page.getByRole('button',{name:'Settings',exact:true}).waitFor({timeout:30000});
   record.nativeHttp=true;record.origin=new URL(page.url()).origin;
   await context.storageState({path:process.env.E_PRIVATE+'/'+user.name+'-browser.json'});fs.chmodSync(process.env.E_PRIVATE+'/'+user.name+'-browser.json',0o600);
   result.users.push(record);fs.writeFileSync(process.env.E_EVIDENCE+'/browser.json',JSON.stringify(result,null,2));
   console.log(JSON.stringify({user:user.name,oidc:true,environment:record.id,nativeHttp:true,coldReadyMs:record.coldReadyMs}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
