[简体中文](./admission-composition.zh-CN.md) | English

# Agent Setup Admission — historical investigation and current proof

This document records the investigation that established DSH Agent `setup` as a usable before-publication composition window. It is historical evidence; current Runtime architecture lives in [`architecture.md`](./architecture.md).

## Historical finding

The original source investigation was performed against DeepSeek Harness commit:

`47f943859bef60e4160492346772ded9b24f765a`

The important finding was not a particular private helper. It was the structural contract:

```text
Agent create/resume
      ↓
caller supplies setup
      ↓
Agent factory awaits setup while unpublished
      ↓
publication / registry entry
```

That means tenant admission or other composition logic can participate before the Agent/Session becomes visible, provided it composes through the public Agent creation API rather than patching a private transport or SessionStore event.

## Current executable evidence

`scripts/admission-decorator-probe.mjs` installs the exact current DSH baseline (`0.1.1-rc.2`) and proves setup-before-entry for all genesis shapes relevant to this repository:

- create;
- fork (`parentSession`);
- subagent (`origin: 'subagent'` + parent);
- resume.

The proof asserts the target Session is absent from the Session registry while the setup callback runs and present after successful publication.

## v0.2 interpretation

v0.2 no longer treats admission as a Web-specific decorator architecture. The broader structural model is:

```text
canonical Principal Runtime
        ↓
derived integration fiber
        ↓ explicit inject
DSH operation / Agent create
        ↓
DSH setup publication window
```

The Principal-derived operation Context supplies identity/capabilities; DSH owns Agent-local setup and registration scope.

This avoids both global `tenantId` plumbing and a second Agent-specific tenancy registry.

## Current authority

- Runtime ownership/lifecycle: [`architecture.md`](./architecture.md)
- exact DSH baseline and probes: [`../reference/compatibility.md`](../reference/compatibility.md)
- historical Session publication investigation: [`session-genesis-map.md`](./session-genesis-map.md)
