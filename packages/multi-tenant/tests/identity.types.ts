import type {
  TenantId, PrincipalId, AllocationKey, EnvironmentNamespace, SandboxUID, PVCUID, PodUID, ResourceVersion,
} from '../src/environment-contract.ts'
import type { EnvironmentId } from '../src/platform/identity.ts'

type Assert<T extends true> = T
type Distinct<A, B> = [A] extends [B] ? false : true
/** Compilation fails if a role becomes a plain string or interchangeable with another role. */
export type IdentitySeparation = [
  Assert<Distinct<TenantId, PrincipalId>>,
  Assert<Distinct<PrincipalId, TenantId>>,
  Assert<Distinct<AllocationKey, TenantId>>,
  Assert<Distinct<EnvironmentId, AllocationKey>>,
  Assert<Distinct<EnvironmentNamespace, EnvironmentId>>,
  Assert<Distinct<SandboxUID, PVCUID>>,
  Assert<Distinct<PVCUID, PodUID>>,
  Assert<Distinct<PodUID, SandboxUID>>,
  Assert<Distinct<ResourceVersion, SandboxUID>>,
  Assert<Distinct<string, TenantId>>,
  Assert<Distinct<string, PrincipalId>>,
  Assert<Distinct<string, AllocationKey>>,
  Assert<Distinct<string, EnvironmentId>>,
  Assert<Distinct<string, EnvironmentNamespace>>,
  Assert<Distinct<string, SandboxUID>>,
  Assert<Distinct<string, PVCUID>>,
  Assert<Distinct<string, PodUID>>,
  Assert<Distinct<string, ResourceVersion>>,
]
