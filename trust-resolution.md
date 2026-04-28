# Trust Resolution

## Trust Question 1: Resolve Trust Status of a Verifiable Service

### Question

Given a DID and an optional point-in-time (ISO 8601 datetime or block height, defaults to now/latest block):

1. **Is the DID a Verifiable Service?** Return the trust status: `TRUSTED`, `UNTRUSTED`, or `PARTIAL`.

   Per the VT spec ([VS-REQ]), a DID qualifies as a **Verifiable Service** only if:
   - **[VS-REQ-2]** It presents a valid Service Credential (`ECS-SERVICE` VTC).
   - **[VS-REQ-3]** If the issuer of the Service Credential **is the VS itself** (self-issued), the VS MUST also present exactly one `ECS-ORG` or `ECS-PERSONA` credential.
   - **[VS-REQ-4]** If the issuer of the Service Credential **is another DID**, then the DID Document of that issuer MUST present exactly one `ECS-ORG` or `ECS-PERSONA` credential.

   This ensures every VS is ultimately bound to a legally or naturally accountable entity — either directly (the VS identifies itself) or indirectly (the issuer of its Service Credential identifies itself). A service MUST satisfy these requirements in at least one ecosystem to be `TRUSTED`. If some ecosystems are satisfied but not all, the status is `PARTIAL`. If none are satisfied, the status is `UNTRUSTED`.

2. **What credentials does it present?** For each credential extracted from the DID's linked-vps:
   - The evaluation result: `VALID`, `IGNORED`, or `FAILED`
   - Whether the credential satisfies an **ECS** requirement (and which one: `ECS-SERVICE`, `ECS-ORG`, `ECS-PERSONA`, `ECS-UA`, or non-ECS)
   - The full **subject claims** (human-readable data from the credential)
   - The **permission chain** — every participant from the ISSUER up to the ECOSYSTEM permission, including for each:
     - Participant DID and whether it is itself a Verifiable Service
     - Permission type (`ISSUER` → optional `ISSUER_GRANTOR` → `ECOSYSTEM`)
     - Trust deposit amount, service name, organization name, and jurisdiction (from their own ECS credentials)

> **Note:** This method supports two modes:
> - **Summary mode** — returns only `trustStatus` and `production` (lightweight check: "is this DID a Verifiable Service?")
> - **Detailed mode** — returns the full credential list with claims and permission chains
>
> To get full details about any participant in the chain (their own credentials and claims), call this same method on their DID.

### Parameters

| Parameter | Type     | Required | Description |
|-----------|----------|----------|-------------|
| `did`     | `string` | yes      | The DID to resolve (e.g., `did:web:acme.example.com`) |
| `detail`  | `string` | no       | `summary` or `full`. Defaults to `full`. |

### JSON Example Response (summary mode)

```json
{
  "did": "did:web:acme-insurance.example.com",
  "trustStatus": "TRUSTED",
  "production": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "expiresAt": "2026-02-14T10:00:00Z"
}
```

### JSON Example Response (detailed mode — Case A: VS presents both Service + Org credentials, per VS-REQ-3)

```json
{
  "did": "did:web:acme-insurance.example.com",
  "trustStatus": "TRUSTED",
  "production": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "expiresAt": "2026-02-14T10:00:00Z",
  "credentials": [
    {
      "result": "VALID",
      "ecsType": "ECS-SERVICE",
      "presentedBy": "did:web:acme-insurance.example.com",
      "issuedBy": "did:web:acme-insurance.example.com",
      "id": "urn:uuid:7b2c5d1a-4e3f-4a2b-8c1d-9e0f1a2b3c4d",
      "type": "VerifiableTrustCredential",
      "format": "W3C_VTC",
      "issuedAt": "2025-06-15T00:00:00Z",
      "validUntil": "2026-06-15T00:00:00Z",
      "digestSri": "sha256-kF3sX9a2...",
      "effectiveIssuanceTime": "2025-06-15T12:34:00Z",
      "vtjscId": "https://credentials.insurance-trust.example.com/schemas/ecs-service/v1",
      "claims": {
        "id": "did:web:acme-insurance.example.com",
        "name": "Acme Insurance Portal",
        "type": "InsuranceService",
        "description": "Online insurance policy management and claims processing platform.",
        "minimumAgeRequired": 18,
        "termsAndConditions": "https://acme-insurance.example.com/terms",
        "termsAndConditionsDigestSri": "sha256-abc123...",
        "privacyPolicy": "https://acme-insurance.example.com/privacy",
        "privacyPolicyDigestSri": "sha256-def456..."
      },
      "schema": {
        "id": 7,
        "jsonSchema": "https://credentials.insurance-trust.example.com/schemas/ecs-service/v1",
        "ecosystemDid": "did:web:insurance-trust.example.com",
        "ecosystemAka": "Global Insurance Trust Network"
      },
      "permissionChain": [
        {
          "permissionId": 142,
          "type": "ISSUER",
          "did": "did:web:acme-insurance.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Acme Insurance Portal",
          "organizationName": "Acme Insurance Corp.",
          "countryCode": "US",
          "legalJurisdiction": "US-CA",
          "deposit": "5000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2025-01-01T00:00:00Z",
          "effectiveUntil": "2027-01-01T00:00:00Z"
        },
        {
          "permissionId": 50,
          "type": "ISSUER_GRANTOR",
          "did": "did:web:naic.example.com",
          "didIsTrustedVS": true,
          "serviceName": "NAIC Trust Gateway",
          "organizationName": "National Association of Insurance Commissioners",
          "countryCode": "US",
          "deposit": "20000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2024-06-01T00:00:00Z",
          "effectiveUntil": "2028-06-01T00:00:00Z"
        },
        {
          "permissionId": 7,
          "type": "ECOSYSTEM",
          "did": "did:web:insurance-trust.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Global Insurance Trust Registry",
          "organizationName": "Global Insurance Trust Network",
          "countryCode": "US",
          "deposit": "50000000uvna",
          "permState": "ACTIVE"
        }
      ]
    },
    {
      "result": "VALID",
      "ecsType": "ECS-ORG",
      "presentedBy": "did:web:acme-insurance.example.com",
      "issuedBy": "did:web:ca-doi.gov.example.com",
      "id": "urn:uuid:a1b2c3d4-e5f6-7890-abcd-111111111111",
      "type": "VerifiableTrustCredential",
      "format": "W3C_VTC",
      "issuedAt": "2025-06-15T00:00:00Z",
      "validUntil": "2026-06-15T00:00:00Z",
      "digestSri": "sha256-gH8iJ3k4...",
      "effectiveIssuanceTime": "2025-06-15T12:35:00Z",
      "vtjscId": "https://credentials.insurance-trust.example.com/schemas/ecs-org/v1",
      "claims": {
        "id": "did:web:acme-insurance.example.com",
        "name": "Acme Insurance Corp",
        "registryId": "C1234567",
        "registryUri": "https://registry.ca.gov/entity/C1234567",
        "address": "100 Insurance Blvd, Sacramento, CA 95814, USA",
        "countryCode": "US",
        "legalJurisdiction": "US-CA",
        "organizationKind": "Insurance Company",
        "lei": "5493001KJTIIGC8Y1R12"
      },
      "schema": {
        "id": 8,
        "jsonSchema": "https://credentials.insurance-trust.example.com/schemas/ecs-org/v1",
        "ecosystemDid": "did:web:insurance-trust.example.com",
        "ecosystemAka": "Global Insurance Trust Network"
      },
      "permissionChain": [
        {
          "permissionId": 143,
          "type": "ISSUER",
          "did": "did:web:ca-doi.gov.example.com",
          "didIsTrustedVS": true,
          "serviceName": "CA Dept. of Insurance — Credential Issuance Service",
          "organizationName": "California Department of Insurance",
          "countryCode": "US",
          "legalJurisdiction": "US-CA",
          "deposit": "5000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2025-01-01T00:00:00Z",
          "effectiveUntil": "2027-01-01T00:00:00Z"
        },
        {
          "permissionId": 51,
          "type": "ISSUER_GRANTOR",
          "did": "did:web:naic.example.com",
          "didIsTrustedVS": true,
          "serviceName": "NAIC Trust Gateway",
          "organizationName": "National Association of Insurance Commissioners",
          "countryCode": "US",
          "deposit": "20000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2024-06-01T00:00:00Z",
          "effectiveUntil": "2028-06-01T00:00:00Z"
        },
        {
          "permissionId": 8,
          "type": "ECOSYSTEM",
          "did": "did:web:insurance-trust.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Global Insurance Trust Registry",
          "organizationName": "Global Insurance Trust Network",
          "countryCode": "US",
          "deposit": "50000000uvna",
          "permState": "ACTIVE"
        }
      ]
    },
    {
      "result": "IGNORED",
      "ecsType": null,
      "presentedBy": "did:web:acme-insurance.example.com",
      "issuedBy": "did:web:fintech-authority.example.com",
      "id": "urn:uuid:e4a5b6c7-d8e9-0f1a-2b3c-4d5e6f7a8b9c",
      "type": "VerifiableTrustCredential",
      "format": "W3C_VTC",
      "issuedAt": "2025-09-01T00:00:00Z",
      "validUntil": "2026-09-01T00:00:00Z",
      "digestSri": "sha256-pQ7rT2b1...",
      "effectiveIssuanceTime": "2025-09-01T08:00:00Z",
      "vtjscId": "https://credentials.fintech-ecosystem.example.com/schemas/fintech-license/v1",
      "claims": {
        "id": "did:web:acme-insurance.example.com",
        "companyName": "Acme Insurance Corp",
        "fintechCategory": "InsurTech",
        "registrationId": "FT-2025-9876"
      },
      "schema": {
        "id": 15,
        "jsonSchema": "https://credentials.fintech-ecosystem.example.com/schemas/fintech-license/v1",
        "ecosystemDid": "did:web:fintech-ecosystem.example.com",
        "ecosystemAka": "FinTech Trust Ecosystem"
      },
      "permissionChain": [
        {
          "permissionId": 310,
          "type": "ISSUER",
          "did": "did:web:fintech-authority.example.com",
          "didIsTrustedVS": true,
          "serviceName": "FCA FinTech Credential Service",
          "organizationName": "Financial Conduct Authority",
          "countryCode": "GB",
          "deposit": "3000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2025-03-01T00:00:00Z",
          "effectiveUntil": "2027-03-01T00:00:00Z"
        },
        {
          "permissionId": 200,
          "type": "ECOSYSTEM",
          "did": "did:web:fintech-ecosystem.example.com",
          "didIsTrustedVS": true,
          "serviceName": "FinTech Trust Registry",
          "organizationName": "FinTech Trust Ecosystem Foundation",
          "countryCode": "GB",
          "deposit": "80000000uvna",
          "permState": "ACTIVE"
        }
      ]
    }
  ],
  "failedCredentials": [
    {
      "id": "urn:uuid:f0a1b2c3-d4e5-6f7a-8b9c-0d1e2f3a4b5c",
      "uri": "https://acme-insurance.example.com/.well-known/vp/additional.jwt",
      "format": "W3C_VTC",
      "error": "Credential signature verification failed: invalid JWS",
      "errorCode": "VP_SIGNATURE_INVALID",
      "serviceId": "did:web:acme-insurance.example.com#vpr-schemas-additional-c-vp",
      "presentationType": "vtc"
    }
  ],
  "dereferenceErrors": []
}
```

> **Per-VP / per-credential outcome accumulator (spec v4):**
> - `failedCredentials[]` carries one entry per credential that failed
>   validation, grouped by verre `errorCode`. Fine-grained codes now
>   pinpoint the broken rule: `ISSUER_PERMISSION_MISSING`,
>   `ISSUER_PERMISSION_NOT_EFFECTIVE`, `ECS_TRUST_REGISTRY_NOT_WHITELISTED`,
>   `VP_SIGNATURE_INVALID`, `FRAGMENT_NOT_CONFORMANT`, etc.
> - `dereferenceErrors[]` carries VP-level failures (the whole VP
>   could not be processed — e.g. HTTP 404, bad signature, unknown
>   fragment suffix). Each entry carries `serviceId`, `vpUrl`,
>   `errorCode`, and `presentationType` (`vtc` or `vtjsc`).
> - A single multi-credential VP whose credentials fail individually
>   is NOT dropped as a whole — the passing credentials appear under
>   `credentials[]` and the failing credentials appear under
>   `failedCredentials[]` with the SAME `serviceId`.

> **Design notes (Case A — VS-REQ-3):**
> - This is the **VS-REQ-3** case: the VS itself presents both the `ECS-SERVICE` credential and an `ECS-ORG` credential. Both have `presentedBy` = the queried DID. The service is `TRUSTED` because both required ECS are satisfied.
> - The `IGNORED` credential belongs to a different ecosystem (FinTech) and is a non-ECS business credential. All checks passed but it doesn't satisfy a required ECS — hence `IGNORED`, not `FAILED`.
> - `didIsTrustedVS` is the result of recursive trust resolution on that participant's DID (including ECOSYSTEM participants — they are not exempt from being Verifiable Services). To see *why* a participant is trusted (their own credentials), call Q1 on their DID.
> - The `ISSUER_GRANTOR` step is optional: it is present only when the credential schema's `issuerPermManagementMode` is `GRANTOR_VALIDATION`. When the mode is `OPEN` or `ECOSYSTEM`, the chain goes directly from `ISSUER` to `ECOSYSTEM`.
> - `serviceName`, `organizationName`, `countryCode`, and `legalJurisdiction` in each permissionChain entry are ECS-derived claims resolved from the participant's own ECS-SERVICE and ECS-ORG credentials (via recursive Q1 on their DID). They are not on-chain permission fields.
> - The `logo`/`avatar` fields (base64 binary) are omitted from claims for brevity.

### JSON Example Response (detailed mode — Case B: Org/Persona credential resolved from the issuer's DID, per VS-REQ-4)

In this case, the VS `did:web:alice-dev.example.com` presents only a Service Credential. The issuer of that credential (`did:web:dev-certify.example.com`) is a different VS that presents an `ECS-ORG` credential. Per **VS-REQ-4**, the resolver follows the issuer's DID and includes the issuer's Org credential in the response, so the caller sees the full trust picture.

```json
{
  "did": "did:web:alice-dev.example.com",
  "trustStatus": "TRUSTED",
  "production": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "expiresAt": "2026-02-14T10:00:00Z",
  "credentials": [
    {
      "result": "VALID",
      "ecsType": "ECS-SERVICE",
      "presentedBy": "did:web:alice-dev.example.com",
      "issuedBy": "did:web:dev-certify.example.com",
      "id": "urn:uuid:c1d2e3f4-a5b6-7890-cdef-222222222222",
      "type": "VerifiableTrustCredential",
      "format": "W3C_VTC",
      "issuedAt": "2025-08-01T00:00:00Z",
      "validUntil": "2026-08-01T00:00:00Z",
      "digestSri": "sha256-mN4oP5q6...",
      "effectiveIssuanceTime": "2025-08-01T14:00:00Z",
      "vtjscId": "https://credentials.dev-trust.example.com/schemas/ecs-service/v1",
      "claims": {
        "id": "did:web:alice-dev.example.com",
        "name": "Alice's Dev Studio",
        "type": "SoftwareDevelopmentService",
        "description": "Full-stack development and consulting services.",
        "minimumAgeRequired": 0,
        "termsAndConditions": "https://alice-dev.example.com/terms",
        "termsAndConditionsDigestSri": "sha256-xyz789...",
        "privacyPolicy": "https://alice-dev.example.com/privacy",
        "privacyPolicyDigestSri": "sha256-uvw012..."
      },
      "schema": {
        "id": 20,
        "jsonSchema": "https://credentials.dev-trust.example.com/schemas/ecs-service/v1",
        "ecosystemDid": "did:web:dev-trust.example.com",
        "ecosystemAka": "Developer Trust Network"
      },
      "permissionChain": [
        {
          "permissionId": 500,
          "type": "ISSUER",
          "did": "did:web:dev-certify.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Dev Certify — Credential Issuance",
          "organizationName": "Dev Certify Inc.",
          "countryCode": "US",
          "legalJurisdiction": "US-DE",
          "deposit": "4000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2025-03-01T00:00:00Z",
          "effectiveUntil": "2027-03-01T00:00:00Z"
        },
        {
          "permissionId": 20,
          "type": "ECOSYSTEM",
          "did": "did:web:dev-trust.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Developer Trust Registry",
          "organizationName": "Developer Trust Network Foundation",
          "countryCode": "CH",
          "deposit": "40000000uvna",
          "permState": "ACTIVE"
        }
      ]
    },
    {
      "result": "VALID",
      "ecsType": "ECS-ORG",
      "presentedBy": "did:web:dev-certify.example.com",
      "issuedBy": "did:web:dev-authority.example.com",
      "id": "urn:uuid:d2e3f4a5-b6c7-8901-defa-333333333333",
      "type": "VerifiableTrustCredential",
      "format": "W3C_VTC",
      "issuedAt": "2025-01-15T00:00:00Z",
      "validUntil": "2026-01-15T00:00:00Z",
      "digestSri": "sha256-rS7tU8v9...",
      "effectiveIssuanceTime": "2025-01-15T09:00:00Z",
      "vtjscId": "https://credentials.dev-trust.example.com/schemas/ecs-org/v1",
      "claims": {
        "id": "did:web:dev-certify.example.com",
        "name": "Dev Certify Inc.",
        "registryId": "DE-789012",
        "registryUri": "https://icis.corp.delaware.gov/ecorp/entity/DE-789012",
        "address": "200 Tech Park Drive, Wilmington, DE 19801, USA",
        "countryCode": "US",
        "legalJurisdiction": "US-DE",
        "organizationKind": "Developer Certification Agency",
        "lei": "2594009HCL0Z3R8MQW42"
      },
      "schema": {
        "id": 21,
        "jsonSchema": "https://credentials.dev-trust.example.com/schemas/ecs-org/v1",
        "ecosystemDid": "did:web:dev-trust.example.com",
        "ecosystemAka": "Developer Trust Network"
      },
      "permissionChain": [
        {
          "permissionId": 510,
          "type": "ISSUER",
          "did": "did:web:dev-authority.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Dev Authority — Org Credential Service",
          "organizationName": "Global Developer Authority",
          "countryCode": "US",
          "deposit": "6000000uvna",
          "permState": "ACTIVE",
          "effectiveFrom": "2024-12-01T00:00:00Z",
          "effectiveUntil": "2026-12-01T00:00:00Z"
        },
        {
          "permissionId": 20,
          "type": "ECOSYSTEM",
          "did": "did:web:dev-trust.example.com",
          "didIsTrustedVS": true,
          "serviceName": "Developer Trust Registry",
          "organizationName": "Developer Trust Network Foundation",
          "countryCode": "CH",
          "deposit": "40000000uvna",
          "permState": "ACTIVE"
        }
      ]
    }
  ],
  "failedCredentials": []
}
```

> **Design notes (Case B — VS-REQ-4):**
> - The VS `did:web:alice-dev.example.com` presents only an `ECS-SERVICE` credential (`presentedBy` = the queried DID). It does **not** present its own Org or Persona credential.
> - The issuer of the Service Credential is `did:web:dev-certify.example.com` — a different VS. Per **VS-REQ-4**, the resolver follows the issuer's DID Document and resolves its `ECS-ORG` credential. This credential appears in the response with `presentedBy` = the issuer's DID, and `claims.id` = the issuer's DID.
> - The service is `TRUSTED` because the combined pair satisfies the VS requirements: Service Credential (from the VS) + Organization Credential (from the issuer). The accountable entity is the issuer (Dev Certify Inc.), not the VS operator directly.
> - If the issuer had instead presented an `ECS-PERSONA` credential (e.g., for a persona-operated certification service), it would appear with `ecsType: "ECS-PERSONA"` and claims like `name`, `controllerCountryCode`, `controllerJurisdiction`.

---

## Trust Question 2: Is a DID an Authorized Issuer for a Given VTJSC?

### Question

Given a DID, a VTJSC identifier (the `credentialSchema.id` URI from a credential), and an optional point-in-time (ISO 8601 datetime or block height, defaults to now/latest block):

1. **Does the DID hold an active `ISSUER` permission** for the Credential Schema that references the given VTJSC?
2. **If fees are enabled**, has the issuer paid by creating a `PermissionSession`?

This answers: "Is `did:web:ca-doi.gov.example.com` currently authorized to issue credentials under the 'Regulated Insurer' schema?"

The authorization check involves **two layers**:

**Layer 1 — Permission check (on-chain, from indexer):**
The resolver looks up the VTJSC → maps it to a `CredentialSchema` → checks whether the DID is the `grantee` of an `ISSUER` permission with `permState=ACTIVE` at the requested point in time.

**Layer 2 — PermissionSession check (on-chain, from VPR [MOD-PERM-MSG-10]):**
Per the VPR spec, *any credential exchange that requires the issuer to pay fees implies the creation of a `PermissionSession`*. Before accepting the issued credential, the holder's agent verifies that the issuer has created a valid `PermissionSession` with the required fees paid. This means:

- If `issuance_fees > 0` on the credential schema's beneficiary permissions, the issuer's VS operator MUST call `CreateOrUpdatePermissionSession` with the `issuer_perm_id`, paying the calculated fees (distributed to all beneficiaries in the permission tree).
- The `PermissionSession` records: issuer perm, agent perm, wallet agent perm, and optionally a `digest_sri`.
- The holder's agent fetches the session via `GetPermissionSession` and verifies it before accepting the credential.

### Parameters

| Parameter   | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `did`       | `string` | yes      | The DID to check (e.g., `did:web:ca-doi.gov.example.com`) |
| `vtjscId`   | `string` | yes      | VTJSC URI (e.g., `https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1`) |
| `sessionId` | `string` | no       | PermissionSession UUID. **Required if fees are enabled** — the resolver uses this to look up the on-chain `PermissionSession` and verify that fees have been paid. If omitted and fees are required, returns HTTP 402. |
| `at`        | `string` | no       | ISO 8601 datetime or integer block height. Defaults to current. |

### JSON Example Response (authorized, fees paid — sessionId provided)

```json
{
  "did": "did:web:ca-doi.gov.example.com",
  "vtjscId": "https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1",
  "authorized": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "permission": {
    "id": 142,
    "type": "ISSUER",
    "schemaId": 7,
    "did": "did:web:ca-doi.gov.example.com",
    "deposit": "5000000uvna",
    "permState": "ACTIVE",
    "effectiveFrom": "2025-01-01T00:00:00Z",
    "effectiveUntil": "2027-01-01T00:00:00Z",
    "issuanceFeeDiscount": "0"
  },
  "session": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "paid": true,
    "issuerPermId": 142,
    "agentPermId": 88,
    "walletAgentPermId": 92,
    "created": "2026-02-13T09:55:00Z"
  },
  "fees": {
    "required": true,
    "pricingAssetType": "COIN",
    "pricingAsset": "uvna",
    "totalBeneficiaryFees": "2000000uvna",
    "beneficiaries": [
      {
        "permissionId": 142,
        "type": "ISSUER",
        "issuanceFees": "500000uvna"
      },
      {
        "permissionId": 50,
        "type": "ISSUER_GRANTOR",
        "issuanceFees": "500000uvna"
      },
      {
        "permissionId": 7,
        "type": "ECOSYSTEM",
        "issuanceFees": "1000000uvna"
      }
    ]
  },
  "permissionChain": [
    {
      "permissionId": 142,
      "type": "ISSUER",
      "did": "did:web:ca-doi.gov.example.com",
      "deposit": "5000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 50,
      "type": "ISSUER_GRANTOR",
      "did": "did:web:naic.example.com",
      "deposit": "20000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 7,
      "type": "ECOSYSTEM",
      "did": "did:web:insurance-trust.example.com",
      "deposit": "50000000uvna",
      "permState": "ACTIVE"
    }
  ]
}
```

### JSON Example Response (fees required, no sessionId → HTTP 402 Payment Required)

```json
{
  "authorized": false,
  "did": "did:web:ca-doi.gov.example.com",
  "vtjscId": "https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1",
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "reason": "Payment required. Issuance fees are enabled for this schema but no sessionId was provided. The issuer must create a PermissionSession (MOD-PERM-MSG-10) and re-query with the sessionId.",
  "fees": {
    "pricingAssetType": "COIN",
    "pricingAsset": "uvna",
    "totalBeneficiaryFees": "2000000uvna",
    "beneficiaries": [
      {
        "permissionId": 142,
        "type": "ISSUER",
        "issuanceFees": "500000uvna"
      },
      {
        "permissionId": 50,
        "type": "ISSUER_GRANTOR",
        "issuanceFees": "500000uvna"
      },
      {
        "permissionId": 7,
        "type": "ECOSYSTEM",
        "issuanceFees": "1000000uvna"
      }
    ]
  }
}
```

### JSON Example Response (authorized, no fees)

```json
{
  "did": "did:web:ca-doi.gov.example.com",
  "vtjscId": "https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1",
  "authorized": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "permission": {
    "id": 142,
    "type": "ISSUER",
    "schemaId": 7,
    "did": "did:web:ca-doi.gov.example.com",
    "deposit": "5000000uvna",
    "permState": "ACTIVE",
    "effectiveFrom": "2025-01-01T00:00:00Z",
    "effectiveUntil": "2027-01-01T00:00:00Z",
    "issuanceFeeDiscount": "1"
  },
  "fees": {
    "required": false,
    "note": "All issuance fees are zero or fully discounted (issuanceFeeDiscount=1). No PermissionSession required for fee payment."
  },
  "permissionChain": [
    {
      "permissionId": 142,
      "type": "ISSUER",
      "did": "did:web:ca-doi.gov.example.com",
      "deposit": "5000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 50,
      "type": "ISSUER_GRANTOR",
      "did": "did:web:naic.example.com",
      "deposit": "20000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 7,
      "type": "ECOSYSTEM",
      "did": "did:web:insurance-trust.example.com",
      "deposit": "50000000uvna",
      "permState": "ACTIVE"
    }
  ]
}
```

### JSON Example Response (not authorized)

```json
{
  "did": "did:web:unknown-issuer.example.com",
  "vtjscId": "https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1",
  "authorized": false,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "reason": "No active ISSUER permission found for DID on schema 7 (VTJSC: regulated-insurer/v1)"
}
```

---

## Trust Question 3: Is a DID an Authorized Verifier for a Given VTJSC?

### Question

Given a DID, a VTJSC identifier, and an optional point-in-time (ISO 8601 datetime or block height, defaults to now/latest block):

1. **Does the DID hold an active `VERIFIER` permission** for the Credential Schema that references the given VTJSC?
2. **If fees are enabled**, has the verifier paid (or is ready to pay) by creating a `PermissionSession`?

This answers: "Is `did:web:employer-portal.example.com` currently authorized to request the presentation of credentials under the 'Employment Certificate' schema?"

The authorization check involves **two layers**:

**Layer 1 — Permission check (on-chain, from indexer):**
The resolver looks up the VTJSC → maps it to a `CredentialSchema` → checks whether the DID is the `grantee` of a `VERIFIER` permission with `permState=ACTIVE` at the requested point in time. This check is identical for W3C and AnonCreds formats — the permission is schema-level, not format-specific.

**Layer 2 — PermissionSession check (on-chain, from VPR [MOD-PERM-MSG-10]):**
Per the VPR spec, *any credential exchange that requires the verifier to pay fees implies the creation of a `PermissionSession`*. Before accepting a presentation request, the holder's agent verifies that the verifier has created a valid `PermissionSession` with the required fees paid. This means:

- If `verification_fees > 0` on the credential schema's beneficiary permissions, the verifier's VS operator MUST call `CreateOrUpdatePermissionSession` with the `verifier_perm_id`, paying the calculated fees (distributed to all beneficiaries in the permission tree).
- The `PermissionSession` records: verifier perm, agent perm, wallet agent perm, and optionally a `digest_sri`.
- The holder's agent fetches the session via `GetPermissionSession` and verifies it before accepting the presentation request.

> **Note on W3C vs AnonCreds:** The permission and fee checks are the same. What differs is the **presentation flow**:
> - **W3C VTC**: The verifier requests a standard Verifiable Presentation; the holder presents the full credential (or with selective disclosure via SD-JWT).
> - **AnonCreds VTC**: The verifier sends a proof request; the holder generates a zero-knowledge proof. The verifier never sees the raw credential — only the proof and disclosed attributes.

### Parameters

| Parameter   | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `did`       | `string` | yes      | The DID to check (e.g., `did:web:employer-portal.example.com`) |
| `vtjscId`   | `string` | yes      | VTJSC URI (e.g., `https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1`) |
| `sessionId` | `string` | no       | PermissionSession UUID. **Required if fees are enabled** — the resolver uses this to look up the on-chain `PermissionSession` and verify that fees have been paid. If omitted and fees are required, the response will indicate `authorized: true` at the permission level but `fees.paid: false`. |
| `at`        | `string` | no       | ISO 8601 datetime or integer block height. Defaults to current. |

### JSON Example Response (authorized, fees paid — sessionId provided)

```json
{
  "did": "did:web:employer-portal.example.com",
  "vtjscId": "https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1",
  "authorized": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "permission": {
    "id": 275,
    "type": "VERIFIER",
    "schemaId": 12,
    "did": "did:web:employer-portal.example.com",
    "deposit": "2000000uvna",
    "permState": "ACTIVE",
    "effectiveFrom": "2025-04-01T00:00:00Z",
    "effectiveUntil": "2027-04-01T00:00:00Z",
    "verificationFeeDiscount": "0"
  },
  "session": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "paid": true,
    "verifierPermId": 275,
    "agentPermId": 88,
    "walletAgentPermId": 88,
    "created": "2026-02-13T09:58:00Z"
  },
  "fees": {
    "required": true,
    "pricingAssetType": "TU",
    "pricingAsset": "tu",
    "totalBeneficiaryFees": "150tu",
    "totalNativeDenom": "3000000uvna",
    "beneficiaries": [
      {
        "permissionId": 275,
        "type": "VERIFIER",
        "verificationFees": "50tu"
      },
      {
        "permissionId": 100,
        "type": "VERIFIER_GRANTOR",
        "verificationFees": "50tu"
      },
      {
        "permissionId": 12,
        "type": "ECOSYSTEM",
        "verificationFees": "50tu"
      }
    ]
  },
  "permissionChain": [
    {
      "permissionId": 275,
      "type": "VERIFIER",
      "did": "did:web:employer-portal.example.com",
      "deposit": "2000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 100,
      "type": "VERIFIER_GRANTOR",
      "did": "did:web:eu-hr-association.example.com",
      "deposit": "15000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 12,
      "type": "ECOSYSTEM",
      "did": "did:web:hr-ecosystem.example.com",
      "deposit": "60000000uvna",
      "permState": "ACTIVE"
    }
  ]
}
```

### JSON Example Response (fees required, no sessionId → HTTP 402 Payment Required)

```json
{
  "authorized": false,
  "did": "did:web:employer-portal.example.com",
  "vtjscId": "https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1",
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "reason": "Payment required. Verification fees are enabled for this schema but no sessionId was provided. The verifier must create a PermissionSession (MOD-PERM-MSG-10) and re-query with the sessionId.",
  "fees": {
    "pricingAssetType": "TU",
    "pricingAsset": "tu",
    "totalBeneficiaryFees": "150tu",
    "totalNativeDenom": "3000000uvna",
    "beneficiaries": [
      {
        "permissionId": 275,
        "type": "VERIFIER",
        "verificationFees": "50tu"
      },
      {
        "permissionId": 100,
        "type": "VERIFIER_GRANTOR",
        "verificationFees": "50tu"
      },
      {
        "permissionId": 12,
        "type": "ECOSYSTEM",
        "verificationFees": "50tu"
      }
    ]
  }
}
```

### JSON Example Response (authorized, no fees)

```json
{
  "did": "did:web:employer-portal.example.com",
  "vtjscId": "https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1",
  "authorized": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "permission": {
    "id": 275,
    "type": "VERIFIER",
    "schemaId": 12,
    "did": "did:web:employer-portal.example.com",
    "deposit": "2000000uvna",
    "permState": "ACTIVE",
    "effectiveFrom": "2025-04-01T00:00:00Z",
    "effectiveUntil": "2027-04-01T00:00:00Z",
    "verificationFeeDiscount": "1"
  },
  "fees": {
    "required": false,
    "note": "All verification fees are zero or fully discounted (verificationFeeDiscount=1). No PermissionSession required for fee payment."
  },
  "permissionChain": [
    {
      "permissionId": 275,
      "type": "VERIFIER",
      "did": "did:web:employer-portal.example.com",
      "deposit": "2000000uvna",
      "permState": "ACTIVE"
    },
    {
      "permissionId": 12,
      "type": "ECOSYSTEM",
      "did": "did:web:hr-ecosystem.example.com",
      "deposit": "60000000uvna",
      "permState": "ACTIVE"
    }
  ]
}
```

### JSON Example Response (expired permission)

```json
{
  "did": "did:web:employer-portal.example.com",
  "vtjscId": "https://credentials.hr-ecosystem.example.com/schemas/employment-cert/v1",
  "authorized": false,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "reason": "VERIFIER permission 275 found but permState=EXPIRED (effectiveUntil: 2025-12-31T23:59:59Z)"
}
```

> **Note:** The same `PermissionSession` requirement applies to **Trust Question 2 (Issuer authorization)** — if `issuance_fees > 0`, the issuer must create a `PermissionSession` paying the calculated fees before issuing a credential. The fee structure is analogous (using `issuance_fees` and `issuance_fee_discount` instead of `verification_fees`).

---

## Trust Question 4: Is a DID a Participant of an Ecosystem Trust Registry?

### Question

Given a DID and an ecosystem trust registry DID, and an optional point-in-time (ISO 8601 datetime or block height, defaults to now/latest block):

1. **Does the DID hold any active permissions** (`ISSUER`, `ISSUER_GRANTOR`, `HOLDER`, `VERIFIER`, `VERIFIER_GRANTOR`, `HOLDER`) for any Credential Schema governed by the specified ecosystem?

This answers: "Is `did:web:ca-doi.gov.example.com` a participant of ecosystem trust registry `did:web:insurance-trust.example.com`?"

The resolver looks up all Credential Schemas whose `ecosystemDid` matches the given ecosystem DID, then checks whether the queried DID is the `grantee` of any permission with `permState=ACTIVE` at the requested point in time. The response lists every active permission.

### Parameters

| Parameter      | Type     | Required | Description |
|----------------|----------|----------|-------------|
| `did`          | `string` | yes      | The DID to check (e.g., `did:web:ca-doi.gov.example.com`) |
| `ecosystemDid` | `string` | yes      | The ecosystem trust registry DID (e.g., `did:web:insurance-trust.example.com`) |
| `at`           | `string` | no       | ISO 8601 datetime or integer block height. Defaults to current. |

### JSON Example Response (participant with multiple roles)

```json
{
  "did": "did:web:ca-doi.gov.example.com",
  "ecosystemDid": "did:web:insurance-trust.example.com",
  "ecosystemAka": "Global Insurance Trust Network",
  "isParticipant": true,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "permissions": [
    {
      "permissionId": 142,
      "did": "did:web:ca-doi.gov.example.com",
      "type": "ISSUER",
      "schemaId": 7,
      "vtjscId": "https://credentials.insurance-trust.example.com/schemas/ecs-service/v1",
      "deposit": "5000000uvna",
      "permState": "ACTIVE",
      "effectiveFrom": "2025-01-01T00:00:00Z",
      "effectiveUntil": "2027-01-01T00:00:00Z"
    },
    {
      "permissionId": 143,
      "did": "did:web:ca-doi.gov.example.com",
      "type": "ISSUER",
      "schemaId": 8,
      "vtjscId": "https://credentials.insurance-trust.example.com/schemas/regulated-insurer/v1",
      "deposit": "5000000uvna",
      "permState": "ACTIVE",
      "effectiveFrom": "2025-01-01T00:00:00Z",
      "effectiveUntil": "2027-01-01T00:00:00Z"
    },
    {
      "permissionId": 50,
      "did": "did:web:ca-doi.gov.example.com",
      "type": "ISSUER_GRANTOR",
      "schemaId": 7,
      "vtjscId": "https://credentials.insurance-trust.example.com/schemas/ecs-service/v1",
      "deposit": "20000000uvna",
      "permState": "ACTIVE",
      "effectiveFrom": "2024-06-01T00:00:00Z",
      "effectiveUntil": "2028-06-01T00:00:00Z"
    }
  ]
}
```

### JSON Example Response (not a participant)

```json
{
  "did": "did:web:random-service.example.com",
  "ecosystemDid": "did:web:insurance-trust.example.com",
  "ecosystemAka": "Global Insurance Trust Network",
  "isParticipant": false,
  "evaluatedAt": "2026-02-13T10:00:00Z",
  "evaluatedAtBlock": 1500000,
  "permissions": []
}
```

> **Design notes:**
> - `isParticipant` is `true` if the DID holds **at least one** active permission in any schema governed by the ecosystem.
> - This is a pure on-chain check — no Q1 trust evaluation is performed. To check if the DID is also a trusted Verifiable Service, call Q1 separately.
> - Each permission entry includes the `vtjscId` so the caller can identify which credential schema the permission applies to.
