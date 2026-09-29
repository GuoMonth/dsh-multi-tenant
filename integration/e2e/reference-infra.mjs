// Local reference prerequisites only: actual Traefik and Dex, not product services.
// Private directory contains locally generated test TLS/client/password material.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const privateRoot=process.env.E_PRIVATE,evidence=process.env.E_EVIDENCE;
if(!privateRoot||!evidence||!process.env.KUBECONFIG)throw Error('E_PRIVATE, E_EVIDENCE, KUBECONFIG required');
const digests=JSON.parse(readFileSync(evidence+'/images.json'));
const namespace='dsh-mvp-e-system';
const users=JSON.parse(readFileSync(privateRoot+'/users.json'));
const clientSecret=readFileSync(privateRoot+'/client-secret','utf8');
const apply=items=>execFileSync('kubectl',['--kubeconfig',process.env.KUBECONFIG,'apply','-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'List',items}),stdio:['pipe','pipe','pipe']});
const meta=name=>({name,namespace});
apply([{apiVersion:'v1',kind:'Namespace',metadata:{name:namespace}}]);
apply([
 {apiVersion:'v1',kind:'Secret',metadata:meta('reference-tls'),type:'kubernetes.io/tls',data:{'tls.crt':readFileSync(privateRoot+'/tls.crt').toString('base64'),'tls.key':readFileSync(privateRoot+'/tls.key').toString('base64')}},
 {apiVersion:'v1',kind:'Secret',metadata:meta('dex-config'),stringData:{'config.json':JSON.stringify({issuer:'https://idp.dsh-mvp-rc2.test',storage:{type:'memory'},web:{http:'0.0.0.0:5556'},oauth2:{skipApprovalScreen:true},enablePasswordDB:true,staticClients:[{id:'dsh-platform',secret:clientSecret,redirectURIs:['https://dsh-mvp-rc2.test/auth/callback'],name:'DSH local reference'}],staticPasswords:users.map(u=>({email:u.email,hash:u.hash,username:u.name,userID:u.userID}))})}},
 {apiVersion:'v1',kind:'ServiceAccount',metadata:meta('traefik')},
 {apiVersion:'rbac.authorization.k8s.io/v1',kind:'ClusterRole',metadata:{name:'dsh-mvp-e-traefik'},rules:[{apiGroups:[''],resources:['services','secrets','nodes'],verbs:['get','list','watch']},{apiGroups:['discovery.k8s.io'],resources:['endpointslices'],verbs:['get','list','watch']},{apiGroups:['networking.k8s.io'],resources:['ingresses','ingressclasses'],verbs:['get','list','watch']},{apiGroups:['networking.k8s.io'],resources:['ingresses/status'],verbs:['update']}]},
 {apiVersion:'rbac.authorization.k8s.io/v1',kind:'ClusterRoleBinding',metadata:{name:'dsh-mvp-e-traefik'},roleRef:{apiGroup:'rbac.authorization.k8s.io',kind:'ClusterRole',name:'dsh-mvp-e-traefik'},subjects:[{kind:'ServiceAccount',name:'traefik',namespace}]},
 {apiVersion:'networking.k8s.io/v1',kind:'IngressClass',metadata:{name:'dsh-mvp-e'},spec:{controller:'traefik.io/ingress-controller'}},
 {apiVersion:'apps/v1',kind:'Deployment',metadata:meta('traefik'),spec:{replicas:1,selector:{matchLabels:{app:'e-traefik'}},template:{metadata:{labels:{app:'e-traefik'}},spec:{serviceAccountName:'traefik',containers:[{name:'traefik',image:'docker.io/library/traefik@'+digests.traefik,imagePullPolicy:'IfNotPresent',args:['--entrypoints.websecure.address=:8443','--entrypoints.websecure.http.tls=true','--providers.kubernetesingress=true','--providers.kubernetesingress.ingressclass=dsh-mvp-e','--providers.kubernetesingress.namespaces=dsh-mvp-e-system,dsh-mvp-e-platform,dsh-mvp-e-platform-final','--log.level=ERROR'],ports:[{name:'https',containerPort:8443,hostPort:443}],resources:{requests:{cpu:'50m',memory:'64Mi'},limits:{cpu:'500m',memory:'256Mi'}}}]}}}},
 {apiVersion:'v1',kind:'Service',metadata:meta('traefik'),spec:{selector:{app:'e-traefik'},ports:[{name:'https',port:443,targetPort:8443}]}},
 {apiVersion:'apps/v1',kind:'Deployment',metadata:meta('dex'),spec:{replicas:1,selector:{matchLabels:{app:'e-dex'}},template:{metadata:{labels:{app:'e-dex'}},spec:{automountServiceAccountToken:false,containers:[{name:'dex',image:'ghcr.io/dexidp/dex@'+digests.dex,imagePullPolicy:'IfNotPresent',args:['dex','serve','/etc/dex/config.json'],ports:[{name:'http',containerPort:5556}],volumeMounts:[{name:'config',mountPath:'/etc/dex',readOnly:true}],resources:{requests:{cpu:'20m',memory:'32Mi'},limits:{cpu:'500m',memory:'128Mi'}}}],volumes:[{name:'config',secret:{secretName:'dex-config'}}]}}}},
 {apiVersion:'v1',kind:'Service',metadata:meta('dex'),spec:{selector:{app:'e-dex'},ports:[{name:'http',port:5556,targetPort:5556}]}},
 {apiVersion:'networking.k8s.io/v1',kind:'Ingress',metadata:meta('dex'),spec:{ingressClassName:'dsh-mvp-e',tls:[{secretName:'reference-tls',hosts:['idp.dsh-mvp-rc2.test']}],rules:[{host:'idp.dsh-mvp-rc2.test',http:{paths:[{path:'/',pathType:'Prefix',backend:{service:{name:'dex',port:{number:5556}}}}]}}]}}
]);
console.log('Applied dedicated E reference prerequisites; no Secret values emitted');
