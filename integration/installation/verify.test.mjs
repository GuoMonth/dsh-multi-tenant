import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chart, sources, verifyAssets, documents, render, inspect, rejectFixture } from '../../charts/install.mjs';

const fixture = new URL('./fixture.values.json', import.meta.url);
const values = JSON.parse(readFileSync(fixture, 'utf8'));
const namespace = 'dsh-install-fixture';
const output = render(fixture.pathname, namespace);
const objects = documents(output);

test('Helm lint passes for explicitly nondeployable fixture', () => {
  const result = spawnSync('helm', ['lint', chart, '--values', fixture.pathname, '--strict'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /Fail:/);
});
test('fixed core and runtime assets retain exact approved bytes', () => {
  verifyAssets();
  const role = readFileSync(resolve(chart, 'files', sources.runtimeRole.file), 'utf8');
  assert.doesNotMatch(role, /secrets|pods\/exec|\*|persistentvolumeclaims.*delete|namespaces.*delete/);
  assert.match(role, /resources: \[pods\]\s+verbs: \[get, list, watch\]/);
  assert.match(role, /resources: \[persistentvolumeclaims, serviceaccounts\]\s+verbs: \[get, create\]/);
  assert.match(role, /resources: \[namespaces\]\s+verbs: \[get, create, patch\]/);
  assert.match(role, /resources: \[nodes\]\s+verbs: \[get\]/);
  assert.match(role, /resources: \[leases\]\s+verbs: \[get\]/);
});
test('chart creates only platform resources, with no per-user control path', () => {
  assert.deepEqual(objects.map(x=>x.kind).sort(), ['ClusterRoleBinding','ConfigMap','Deployment','Ingress','PersistentVolumeClaim','Service','ServiceAccount'].sort());
  assert.equal(objects.filter(x=>x.kind==='PersistentVolumeClaim').length, 1);
  const claim = objects.find(x=>x.kind==='PersistentVolumeClaim');
  assert.equal(claim.metadata.name, 'dsh-platform-state');
  assert.equal(claim.metadata.annotations['helm.sh/resource-policy'], 'keep');
  assert.equal(objects.find(x=>x.kind==='ClusterRoleBinding').subjects[0].namespace, namespace);
  const deployment = objects.find(x=>x.kind==='Deployment');
  assert.equal(deployment.spec.replicas, 1);
  assert.equal(deployment.spec.strategy.type, 'Recreate');
  assert.equal(deployment.spec.template.metadata.labels['app.kubernetes.io/name'], 'dsh-platform');
});
test('config matches C and runtime options, private identity stays in platform', () => {
  const {config,pod,ingress,secret} = inspect(output);
  assert.deepEqual(Object.keys(config).sort(), ['runtime','stateFile','adminSocket','oidc','members','host','port'].sort());
  assert.equal(config.runtime.platformNamespace, namespace);
  assert.equal(config.runtime.storage.size, '10Gi');
  assert.equal(config.runtime.domain, 'env.dsh.example.invalid');
  assert.deepEqual(config.runtime.resources, {requests:{cpu:'250m',memory:'512Mi'},limits:{cpu:'2',memory:'2Gi'}});
  assert.equal(config.oidc.clientSecretFile, '/private/oidc-client-secret');
  assert.equal(config.members.length, 2);
  assert.equal(secret.secretName, 'dsh-oidc');
  assert.equal(pod.automountServiceAccountToken, false);
  assert.equal(pod.securityContext.runAsUser, 1000);
  assert.equal(pod.containers[0].readinessProbe.httpGet.path, '/healthz');
  assert.match(pod.initContainers[0].command[2], /0o600/);
  assert.match(pod.initContainers[0].command[2], /0o700/);
  assert.deepEqual(ingress.spec.rules.map(x=>x.host), ['dsh.example.invalid','*.env.dsh.example.invalid']);
  assert.throws(()=>rejectFixture(inspect(output)), /Fixture/);
});
test('fail early for missing prerequisites, floating digests and accidental legacy fields', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'dsh-install-test-'));
  try {
    for (const changes of [
      {platformImage:'example.invalid/platform:latest'},
      {workloadImage:''}, {domain:'https://wrong.example'}, {tlsSecretName:''},
      {storageClassName:''}, {storageSize:'0Gi'}, {members:[]},
      {resources:{requests:{cpu:'250m',memory:null},limits:{cpu:'2',memory:'2Gi'}}},
      {resources:{requests:{cpu:'1Gi',memory:'512Mi'},limits:{cpu:'2',memory:'2Gi'}}},
      {namespacePrefix:'a'.repeat(25)},
      {environments:[]}, {modelSecret:'must-not-exist'},
      {members:[{...values.members[0],issuer:'https://wrong.example'}]},
    ]) {
      const file=resolve(directory,'values.json');
      writeFileSync(file,JSON.stringify({...values,...changes}));
      assert.throws(()=>render(file,namespace), /helm template failed/, JSON.stringify(changes));
    }
    const missing=spawnSync('helm',['template','dsh-platform',chart],{encoding:'utf8'});
    assert.notEqual(missing.status,0);
    assert.match(missing.stderr,/platformImage|workloadImage/);
    const valid=resolve(directory,'valid.json');
    writeFileSync(valid,JSON.stringify({...values,namespacePrefix:'a'.repeat(24),resources:{requests:{cpu:'0.5',memory:'512Mi'},limits:{cpu:'2',memory:'2Gi'}}}));
    assert.equal(inspect(render(valid,namespace)).config.runtime.resources.requests.cpu,'0.5');
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('live installer refuses fixtures before reaching Kubernetes', () => {
  const result=spawnSync(process.execPath,[resolve(chart,'..','install.mjs'),'install','--values',fixture.pathname,'--namespace',namespace],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Fixture domain\/image/);
});
