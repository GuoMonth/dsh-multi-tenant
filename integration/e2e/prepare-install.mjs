// Prepare private fixture inputs; this does not replace charts/install.mjs.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=process.env.E_PRIVATE,evidence=process.env.E_EVIDENCE,config=process.env.KUBECONFIG;
if(!root||!evidence||!config)throw Error('Explicit reference paths required');
const k=(args,input)=>execFileSync('kubectl',['--kubeconfig',config,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const namespace=process.env.E_NAMESPACE||'dsh-mvp-e-platform';
const cluster=process.env.E_CLUSTER||'dsh-mvp-rc2';
const apply=items=>k(['apply','-f','-'],JSON.stringify({apiVersion:'v1',kind:'List',items}));
apply([{apiVersion:'v1',kind:'Namespace',metadata:{name:namespace}}]);
apply([{apiVersion:'v1',kind:'Secret',metadata:{name:'reference-tls',namespace},type:'kubernetes.io/tls',data:{'tls.crt':readFileSync(root+'/tls.crt').toString('base64'),'tls.key':readFileSync(root+'/tls.key').toString('base64')}},{apiVersion:'v1',kind:'Secret',metadata:{name:'reference-oidc',namespace},data:{'client-secret':readFileSync(root+'/client-secret').toString('base64')}},{apiVersion:'v1',kind:'Secret',metadata:{name:'reference-ca',namespace},data:{'ca.crt':readFileSync(root+'/ca.crt').toString('base64')}}]);
const images=JSON.parse(readFileSync(evidence+'/images.json'));
const users=JSON.parse(readFileSync(root+'/users.json'));
// Dex's public subject is its protobuf ID+connector reference encoded base64url.
const subject=id=>Buffer.concat([Buffer.from([10,Buffer.byteLength(id)]),Buffer.from(id),Buffer.from([18,5]),Buffer.from('local')]).toString('base64url');
const values={platformImage:images.platformImage||'docker.io/library/dsh-mvp-rc2@'+images.platform,workloadImage:images.workloadImage||'docker.io/library/dsh-mvp-rc2@sha256:338d50f33680b8b1e10c6691596118e2273e48f084a609ea2734143c54a5feff',domain:'dsh-mvp-rc2.test',ingressClassName:'dsh-mvp-e',tlsSecretName:'reference-tls',oidc:{issuer:'https://idp.dsh-mvp-rc2.test',clientId:'dsh-platform',secretName:'reference-oidc',secretKey:'client-secret',caSecretName:'reference-ca',caSecretKey:'ca.crt'},members:users.map(u=>({issuer:'https://idp.dsh-mvp-rc2.test',subject:subject(u.userID),owner:{tenantId:'e-reference',principalId:u.name}})),storageClassName:'standard',storageSize:'1Gi',controlStorageSize:'1Gi',namespacePrefix:'dsh-mvp-e-user',resources:{requests:{cpu:'100m',memory:'256Mi'},limits:{cpu:'1',memory:'1Gi'}}};
writeFileSync(root+'/values.json',JSON.stringify(values,null,2)+'\n',{mode:0o600});
const kube=JSON.parse(k(['config','view','--raw','--minify','-o','json']));kube.clusters[0].cluster.server=`https://${cluster}-control-plane:6443`;writeFileSync(root+'/container-kubeconfig',JSON.stringify(kube),{mode:0o600});
const coredns=JSON.parse(k(['get','configmap','coredns','-n','kube-system','-o','json']));
if(!existsSync(root+'/coredns-before.json'))writeFileSync(root+'/coredns-before.json',JSON.stringify(coredns),{mode:0o600});
const ip=JSON.parse(k(['get','service','traefik','-n','dsh-mvp-e-system','-o','json'])).spec.clusterIP;
if(!coredns.data.Corefile.includes('idp.dsh-mvp-rc2.test')){coredns.data.Corefile=coredns.data.Corefile.replace('    kubernetes ',`    hosts {\n        ${ip} idp.dsh-mvp-rc2.test\n        fallthrough\n    }\n    kubernetes `);k(['replace','-f','-'],JSON.stringify(coredns));}
const node=JSON.parse(execFileSync('docker',['inspect',`${cluster}-control-plane`],{encoding:'utf8'}))[0].NetworkSettings.Networks.kind.IPAddress;
writeFileSync(evidence+'/reference-network.json',JSON.stringify({namespace,nodeAddress:node,issuerService:ip,domain:values.domain,issuer:values.oidc.issuer},null,2)+'\n');
console.log('Prepared private values and reference DNS; no credential values emitted');
