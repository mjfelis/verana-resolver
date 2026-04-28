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
}

export interface EvaluationContext {
  visitedDids: Set<string>;
  currentBlock: number;
  cacheTtlSeconds: number;
  trustMemo: Map<string, TrustResult>;
  allowedEcosystemDids: Set<string>;
}
