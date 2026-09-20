import json,pathlib,subprocess,base64,os
lab=pathlib.Path(os.environ['DSH_REGRESSION_HOME']).resolve()
k=['kubectl','--kubeconfig',str(lab/'private/kubeconfig')]
def get(*args): return json.loads(subprocess.check_output(k+list(args)+['-o','json']))
cell=get('-n','calibration','get','cell','profile')
uid=cell['metadata']['uid']
pod=get('-n','calibration','get','statefulset','cell-'+uid)['spec']['template']['spec']
pod=json.loads(json.dumps(pod).replace('cell-'+uid+'.cells.test','${ORIGIN_HOST}').replace(uid,'${INSTANCE_ID}'))
profile={'template':'regression-v1','expectedSpec':cell['spec'],'expectedPodSpec':pod}
(lab/'profile.json').write_text(json.dumps(profile,indent=2)+'\n')
envs=[];members=[]
for label,tenant in [('alice','tenant-a'),('bob','tenant-b')]:
 owner={'tenantId':tenant,'principalId':label}
 for suffix in ['main']:
  envs.append({'id':label+'-'+suffix,'owner':owner,'template':'regression-v1'})
 user=(label+'-sub').encode(); subject=base64.urlsafe_b64encode(bytes([10,len(user)])+user+b'\x12\x05local').decode().rstrip('=')
 members.append({'issuer':'https://dex.dsh-system.svc:15556/dex','subject':subject,'owner':owner})
config={'host':'0.0.0.0','port':8080,'kubernetes':{'server':'https://kubernetes.default.svc','caFile':'/var/run/secrets/kubernetes.io/serviceaccount/ca.crt','tokenFile':'/var/run/secrets/kubernetes.io/serviceaccount/token'},'allocation':{'namespaces':{'tenant-a':'tenant-a','tenant-b':'tenant-b'},'domain':'cells.test','profiles':[profile]},'stateFile':'/private/state.sqlite','adminSocket':'/private/admin.sock','environments':envs,'members':members,'oidc':{'issuer':'https://dex.dsh-system.svc:15556/dex','clientId':'dsh-browser','clientSecretFile':'/private/client-secret','platformOrigin':'https://platform.cells.test','siteDomain':'cells.test'}}
(lab/'private/config.json').write_text(json.dumps(config,indent=2)+'\n')
