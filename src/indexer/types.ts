export interface BlockHeightResponse {
  type: string;
  height: number;
  timestamp: string;
}

export interface ActivityItem {
  timestamp: string;
  block_height: string;
  entity_type: string;
  entity_id: string;
  account: string;
  msg: string;
  changes: { did?: string; grantee?: string; [key: string]: unknown } | null;
}

export interface ChangesResponse {
  block_height: number;
  activity: ActivityItem[];
  // Hint from the indexer pointing at the next block height that has
  // activity, when the requested block has none. The polling loop uses
  // this to fast-forward across long empty ranges instead of walking
  // every block one-by-one. Optional for backward compatibility with
  // older indexer versions that do not surface the hint.
  next_change_at?: number;
}

export interface TrustRegistryDocument {
  id: string;
  gfv_id: string;
  created: string;
  language: string;
  url: string;
  digest_sri: string;
}

export interface TrustRegistryVersion {
  id: string;
  tr_id: string;
  created: string;
  version: number;
  active_since: string;
  documents: TrustRegistryDocument[];
}

export interface TrustRegistry {
  id: string;
  did: string;
  controller: string;
  created: string;
  modified: string;
  archived: string | null;
  deposit: string;
  aka: string | null;
  language: string;
  active_version: number;
  participants: number;
  active_schemas: number;
  archived_schemas: number;
  weight: string;
  issued: number;
  verified: number;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  ecosystem_slashed_amount_repaid: string;
  network_slash_events: number;
  network_slashed_amount: string;
  network_slashed_amount_repaid: string;
  versions: TrustRegistryVersion[];
}

export interface TrustRegistryResponse {
  trust_registry: TrustRegistry;
}

export interface TrustRegistryListResponse {
  trust_registries: TrustRegistry[];
}

export interface CredentialSchema {
  id: string;
  tr_id: string;
  title: string;
  description: string;
  json_schema: string;
  created: string;
  modified: string;
  archived: string | null;
  issuer_perm_management_mode: string;
  verifier_perm_management_mode: string;
  digest_algorithm: string;
  participants: number;
  weight: string;
  issued: number;
  verified: number;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  network_slash_events: number;
  network_slashed_amount: string;
}

export interface CredentialSchemaResponse {
  schema: CredentialSchema;
}

export interface JsonSchemaContentResponse {
  schema: string;
}

export interface CredentialSchemaListResponse {
  schemas: CredentialSchema[];
}

export interface Permission {
  id: string;
  schema_id: string;
  type: string;
  grantee: string;
  did: string;
  created: string;
  modified: string;
  effective: string;
  expiration: string | null;
  effective_until?: string | null;
  revoked: string | null;
  slashed: string | null;
  repaid: string | null;
  deposit: string;
  country: string;
  vp_state: string;
  perm_state: string;
  validator_perm_id: string | null;
  issuance_fees?: string;
  verification_fees?: string;
  validation_fees?: string;
  issuance_fee_discount?: string;
  verification_fee_discount?: string;
  issued: number;
  verified: number;
  ecosystem_slash_events: number;
  ecosystem_slashed_amount: string;
  network_slash_events: number;
  network_slashed_amount: string;
}

export interface PermissionResponse {
  permission: Permission;
}

export interface PermissionListResponse {
  permissions: Permission[];
}

export interface PermissionSessionRecord {
  issuer_perm_id: string;
  verifier_perm_id: string;
  wallet_agent_perm_id: string | null;
}

export interface PermissionSession {
  id: string;
  authority: string;
  vs_operator: string;
  agent_perm_id: string;
  created: string;
  modified: string;
  records: PermissionSessionRecord[];
}

export interface PermissionSessionResponse {
  permission_session: PermissionSession;
}

export interface PermissionSessionListResponse {
  permission_sessions: PermissionSession[];
}

export interface BeneficiaryResponse {
  permissions: Permission[];
}

export interface TrustDeposit {
  account: string;
  share: string;
  amount: string;
  claimable: string;
  slashed_deposit: string;
  repaid_deposit: string;
  last_slashed: string | null;
  last_repaid: string | null;
  slash_count: number;
  last_repaid_by: string;
}

export interface TrustDepositResponse {
  trust_deposit: TrustDeposit;
}

export interface DigestResponse {
  digest: {
    digest_sri: string;
    created: string;
    creator: string;
    [key: string]: unknown;
  };
}

export interface ExchangeRate {
  id: string;
  base_asset_type: string;
  base_asset: string;
  quote_asset_type: string;
  quote_asset: string;
  rate: string;
  state: boolean;
  expire: string | null;
  created: string;
  modified: string;
}

export interface ExchangeRateResponse {
  exchange_rate: ExchangeRate;
}

export interface ExchangeRateListResponse {
  exchange_rates: ExchangeRate[];
}

export interface PriceResponse {
  price: string;
  rate: string;
  base_amount: string;
}

export interface ListPermissionsParams {
  did?: string;
  grantee?: string;
  schema_id?: string;
  type?: 'ISSUER' | 'VERIFIER' | 'ISSUER_GRANTOR' | 'VERIFIER_GRANTOR' | 'ECOSYSTEM' | 'HOLDER';
  only_valid?: boolean;
  perm_state?: string;
  response_max_size?: number;
  when?: string;
}

export interface ListCredentialSchemasParams {
  tr_id?: string;
  json_schema?: string;
  only_active?: boolean;
  issuer_perm_management_mode?: string;
  verifier_perm_management_mode?: string;
  response_max_size?: number;
  participant?: string;
}

export interface GetExchangeRateParams {
  id?: string;
  base_asset_type?: string;
  base_asset?: string;
  quote_asset_type?: string;
  quote_asset?: string;
  state?: boolean;
  expire_ts?: string;
}

export interface ListTrustRegistriesParams {
  active_gf_only?: boolean;
  preferred_language?: string;
  authority?: string;
  controller?: string;
  only_active?: boolean;
  participant?: string;
  response_max_size?: number;
}

export interface GetPriceParams {
  base_asset_type: string;
  base_asset: string;
  quote_asset_type: string;
  quote_asset: string;
  amount: string;
}
