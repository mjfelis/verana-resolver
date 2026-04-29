export type TrustStatus = 'TRUSTED' | 'PARTIAL' | 'UNTRUSTED';
export type CredentialResultStatus = 'VALID' | 'IGNORED' | 'FAILED';
export type EcsType = 'ECS-SERVICE' | 'ECS-ORG' | 'ECS-PERSONA' | 'ECS-UA' | null;
export type PermissionType =
  | 'ISSUER'
  | 'ISSUER_GRANTOR'
  | 'ECOSYSTEM'
  | 'VERIFIER'
  | 'VERIFIER_GRANTOR';

export interface PermissionChainEntry {
  permissionId: number;
  type: PermissionType;
  did: string;
  didIsTrustedVS: boolean;
  serviceName?: string;
  organizationName?: string;
  countryCode?: string;
  legalJurisdiction?: string;
  deposit: string;
  permState: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export interface CredentialSchemaInfo {
  id: number;
  trId: string;
  jsonSchema: string;
  ecosystemDid: string;
  ecosystemAka?: string;
  issuerPermManagementMode: string;
}

export interface CredentialEvaluation {
  result: CredentialResultStatus;
  ecsType: EcsType;
  presentedBy: string;
  issuedBy: string;
  id: string;
  type: string;
  format: string;
  issuedAt?: string;
  validUntil?: string;
  digestSri?: string;
  effectiveIssuanceTime?: string;
  vtjscId?: string;
  claims: Record<string, unknown>;
  schema?: CredentialSchemaInfo;
  permissionChain: PermissionChainEntry[];
  error?: string;
  errorCode?: string;
}

export interface FailedCredential {
  id: string;
  uri?: string;
  format: string;
  error: string;
  errorCode: string;
  /** DID Document service id (with fragment) the credential came from, when available. */
  serviceId?: string;
  /**
   * Presentation flow that produced the credential — `'vtc'` for the
   * standard W3C VTC flow or `'vtjsc'` for credentials presented
   * directly via a `-vtjsc-vp` / `-jsc-vp` linked-vp service.
   */
  presentationType?: 'vtc' | 'vtjsc';
}

export interface VPDereferenceError {
  vpUrl: string;
  error: string;
  /** Error code (verre `TrustErrorCode`); enables programmatic disambiguation. */
  errorCode?: string;
  /** DID Document service id (with fragment) where this VP failed. */
  serviceId?: string;
  /** Presentation flow declared by the service fragment. */
  presentationType?: 'vtc' | 'vtjsc';
}

/**
 * A linked-vp service entry from the queried DID Document that yielded
 * at least one valid credential. Aligned with the public response shape
 * defined in verana-indexer#227.
 *
 * The same VP MAY also appear in `InvalidPresentation[]` when it is
 * partially valid (some credentials passed, some failed). In that case
 * `credentialIds` lists ONLY the passing credentials; the failing ones
 * are reported in the matching `InvalidPresentation` entries.
 */
export interface ValidPresentation {
  /**
   * URL declared as `serviceEndpoint` of the `LinkedVerifiablePresentation`
   * service entry in the DID Document (the dereferenced VP).
   */
  id: string;
  /** IDs of the credentials inside the VP that passed validation. */
  credentialIds: string[];
  /** DID Document service id (with fragment), e.g. `did:web:foo#vpr-schemas-service-vtc-vp`. */
  serviceId?: string;
  /** Presentation flow declared by the service fragment. */
  presentationType?: 'vtc' | 'vtjsc';
}

/**
 * A linked-vp service entry that failed at least one validation step.
 * One entry per `(VP, errorCode)` pair: a single VP MAY appear multiple
 * times if different credentials inside it fail for different reasons,
 * and MAY co-exist with a `ValidPresentation` for the same `id` when
 * the VP is partially valid (per verana-indexer#227).
 *
 * For VP-level failures (`DEREFERENCE_FAILED`, `VP_SIGNATURE_INVALID`,
 * `VP_NOT_CONFORMANT`, `FRAGMENT_NOT_CONFORMANT`), `credentialIds` MAY
 * be empty since the inner credentials were never evaluated.
 */
export interface InvalidPresentation {
  /**
   * URL declared as `serviceEndpoint` of the `LinkedVerifiablePresentation`
   * service entry; for VP-level fragment errors, falls back to the DID
   * Document service id (no actual URL exists in that case).
   */
  id: string;
  /** Error code (verre `TrustErrorCode`); see verana-indexer#227 for the canonical table. */
  errorCode: string;
  /** Human-readable diagnostic. */
  errorMessage: string;
  /** Failing credential IDs grouped by `errorCode`. Empty for VP-level failures. */
  credentialIds: string[];
  /** DID Document service id (with fragment) when known. */
  serviceId?: string;
  /** Presentation flow declared by the service fragment when known. */
  presentationType?: 'vtc' | 'vtjsc';
}

export interface TrustResult {
  did: string;
  trustStatus: TrustStatus;
  production: boolean;
  evaluatedAt: string;
  evaluatedAtBlock: number;
  expiresAt: string;
  credentials: CredentialEvaluation[];
  failedCredentials: FailedCredential[];
  dereferenceErrors: VPDereferenceError[];
  /**
   * Per-VP outcomes (verana-indexer#227). `validPresentations` and
   * `invalidPresentations` carry the full per-presentation result for
   * every linked-vp service entry the queried DID Document publishes.
   * `failedCredentials` and `dereferenceErrors` remain populated as
   * back-compat projections (failedCredentials = credential-level
   * entries from `invalidPresentations`; dereferenceErrors = VP-level
   * entries from `invalidPresentations`).
   */
  validPresentations: ValidPresentation[];
  invalidPresentations: InvalidPresentation[];
}

export interface EvaluationContext {
  visitedDids: Set<string>;
  currentBlock: number;
  cacheTtlSeconds: number;
  trustMemo: Map<string, TrustResult>;
  allowedEcosystemDids: Set<string>;
}
