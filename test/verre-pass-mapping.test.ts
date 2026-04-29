/**
 * Unit tests for the verre→resolver mapping in `buildTrustResult`.
 *
 * These tests exercise the per-VP / per-credential outcome accumulator:
 *
 *   * `validPresentations`  → mapped onto `credentials`
 *   * `invalidPresentations` with `credentialIds.length === 0`
 *                          → mapped onto `dereferenceErrors`
 *   * `invalidPresentations` with `credentialIds.length > 0`
 *                          → expanded into one `failedCredentials` entry
 *                            per credentialId
 *
 * The mapping must also preserve backward compatibility for older verre
 * versions that do not populate the per-VP arrays (legacy single-entry
 * `failedCredentials` fallback).
 */
import { describe, it, expect } from 'vitest';
import {
  TrustResolutionOutcome,
  TrustErrorCode,
  ECS,
  PresentationType,
  type TrustResolution,
} from '@verana-labs/verre';

import { buildTrustResult, isVpLevelFailure } from '../src/polling/verre-pass.js';

const DID = 'did:web:vs.example.com';
const ISSUER_DID = 'did:web:issuer.example.com';
const CURRENT_BLOCK = 1_500_000;
const TTL = 86_400;

/** Minimal valid TrustResolution skeleton; tests override pieces as needed. */
function baseResolution(overrides: Partial<TrustResolution> = {}): TrustResolution {
  return {
    didDocument: { id: DID } as any,
    verified: true,
    outcome: TrustResolutionOutcome.VERIFIED,
    validPresentations: [],
    invalidPresentations: [],
    ...overrides,
  };
}

describe('isVpLevelFailure', () => {
  it('classifies entries with empty credentialIds as VP-level failures', () => {
    expect(
      isVpLevelFailure({
        serviceId: `${DID}#vpr-schemas-service-c-vp`,
        vpUrl: 'https://example.com/vp',
        credentialIds: [],
        errorCode: TrustErrorCode.DEREFERENCE_FAILED,
        errorMessage: 'fetch failed',
      }),
    ).toBe(true);
  });

  it('classifies entries with credentialIds and a credential-level code as credential-level', () => {
    expect(
      isVpLevelFailure({
        serviceId: `${DID}#vpr-schemas-service-c-vp`,
        vpUrl: 'https://example.com/vp',
        credentialIds: ['urn:uuid:cred-1'],
        errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
        errorMessage: 'no ISSUER permission',
      }),
    ).toBe(false);
  });

  it('classifies entries with credentialIds but a VP-level code as VP-level (fallback)', () => {
    // This shouldn't normally happen but the fallback guards against it.
    expect(
      isVpLevelFailure({
        serviceId: `${DID}#vpr-schemas-service-c-vp`,
        vpUrl: 'https://example.com/vp',
        credentialIds: ['urn:uuid:cred-1'],
        errorCode: TrustErrorCode.VP_SIGNATURE_INVALID,
        errorMessage: 'sig fail',
      }),
    ).toBe(true);
  });
});

describe('buildTrustResult — happy path', () => {
  it('maps verified service + serviceProvider onto `credentials`', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        service: {
          schemaType: ECS.SERVICE,
          id: DID,
          issuer: DID,
          name: 'Demo Service',
          type: 'TestService',
          description: 'A',
          minimumAgeRequired: 0,
          termsAndConditions: 'https://example.com/terms',
          privacyPolicy: 'https://example.com/privacy',
        } as any,
        serviceProvider: {
          schemaType: ECS.ORG,
          id: DID,
          issuer: DID,
          name: 'Demo Org',
          registryId: 'reg-1',
          address: 'addr',
          countryCode: 'US',
        } as any,
        validPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-service-vtc-vp`,
            vpUrl: 'https://example.com/vp-svc',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:cred-svc'],
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.trustStatus).toBe('TRUSTED');
    expect(result.production).toBe(true);
    expect(result.credentials).toHaveLength(2);
    expect(result.credentials[0].ecsType).toBe('ECS-SERVICE');
    expect(result.credentials[1].ecsType).toBe('ECS-ORG');
    expect(result.failedCredentials).toEqual([]);
    expect(result.dereferenceErrors).toEqual([]);
  });

  it('maps VS-REQ-4 (external service issuer) — provider presentedBy = issuer DID', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        service: {
          schemaType: ECS.SERVICE,
          id: DID,
          issuer: ISSUER_DID, // external issuer
          name: 'Svc',
          type: 'Svc',
          description: 'A',
          minimumAgeRequired: 0,
          termsAndConditions: 'https://example.com/terms',
          privacyPolicy: 'https://example.com/privacy',
        } as any,
        serviceProvider: {
          schemaType: ECS.ORG,
          id: ISSUER_DID,
          issuer: ISSUER_DID,
          name: 'IssuerOrg',
          registryId: 'reg',
          address: 'addr',
          countryCode: 'US',
        } as any,
      }),
      CURRENT_BLOCK,
      TTL,
    );

    const orgCred = result.credentials.find((c) => c.ecsType === 'ECS-ORG');
    expect(orgCred?.presentedBy).toBe(ISSUER_DID);
  });
});

describe('buildTrustResult — VP-level failures (dereferenceErrors)', () => {
  it('maps DEREFERENCE_FAILED onto dereferenceErrors with full context', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-org-c-vp`,
            vpUrl: 'https://example.com/vp-org',
            presentationType: PresentationType.VTC,
            credentialIds: [],
            errorCode: TrustErrorCode.DEREFERENCE_FAILED,
            errorMessage: 'HTTP 404',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.dereferenceErrors).toHaveLength(1);
    expect(result.dereferenceErrors[0]).toEqual({
      vpUrl: 'https://example.com/vp-org',
      error: 'HTTP 404',
      errorCode: TrustErrorCode.DEREFERENCE_FAILED,
      serviceId: `${DID}#vpr-schemas-org-c-vp`,
      presentationType: PresentationType.VTC,
    });
    expect(result.failedCredentials).toEqual([]);
  });

  it('maps VP_SIGNATURE_INVALID and FRAGMENT_NOT_CONFORMANT onto dereferenceErrors', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-service-c-vp`,
            vpUrl: 'https://example.com/vp-bad-sig',
            presentationType: PresentationType.VTC,
            credentialIds: [],
            errorCode: TrustErrorCode.VP_SIGNATURE_INVALID,
            errorMessage: 'invalid signature',
          },
          {
            serviceId: `${DID}#vpr-schemas-bogus-suffix`,
            vpUrl: `${DID}#vpr-schemas-bogus-suffix`,
            credentialIds: [],
            errorCode: TrustErrorCode.FRAGMENT_NOT_CONFORMANT,
            errorMessage: 'unknown suffix',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.dereferenceErrors).toHaveLength(2);
    expect(result.dereferenceErrors.map((e) => e.errorCode).sort()).toEqual([
      TrustErrorCode.FRAGMENT_NOT_CONFORMANT,
      TrustErrorCode.VP_SIGNATURE_INVALID,
    ]);
    expect(result.failedCredentials).toEqual([]);
  });
});

describe('buildTrustResult — credential-level failures (failedCredentials)', () => {
  it('expands an invalidPresentation with N credentialIds into N failedCredentials', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-mixed-c-vp`,
            vpUrl: 'https://example.com/vp-mixed',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:cred-A', 'urn:uuid:cred-B'],
            errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
            errorMessage: 'no ISSUER permission',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.failedCredentials).toHaveLength(2);
    expect(result.failedCredentials.map((f) => f.id).sort()).toEqual([
      'urn:uuid:cred-A',
      'urn:uuid:cred-B',
    ]);
    // Each entry preserves the verre code, vpUrl, serviceId and presentationType.
    for (const fc of result.failedCredentials) {
      expect(fc.errorCode).toBe(TrustErrorCode.ISSUER_PERMISSION_MISSING);
      expect(fc.uri).toBe('https://example.com/vp-mixed');
      expect(fc.serviceId).toBe(`${DID}#vpr-schemas-mixed-c-vp`);
      expect(fc.presentationType).toBe(PresentationType.VTC);
      expect(fc.format).toBe('W3C_VTC');
    }
    expect(result.dereferenceErrors).toEqual([]);
  });

  it('uses W3C_VTJSC format for vtjsc-flow credential failures', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-svc-vtjsc-vp`,
            vpUrl: 'https://example.com/vp-vtjsc',
            presentationType: PresentationType.VTJSC,
            credentialIds: ['urn:uuid:vtjsc-cred-1'],
            errorCode: TrustErrorCode.ECS_TRUST_REGISTRY_NOT_WHITELISTED,
            errorMessage: 'ecosystem not whitelisted',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.failedCredentials).toHaveLength(1);
    expect(result.failedCredentials[0].format).toBe('W3C_VTJSC');
    expect(result.failedCredentials[0].presentationType).toBe(PresentationType.VTJSC);
  });

  it('handles a partially-valid VP — some credentials in `credentials`, some in `failedCredentials`', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        // Note: `service` is set since at least one VC passed (the SERVICE one).
        // The SERVICE VC validation is what populated `resolution.service`.
        service: {
          schemaType: ECS.SERVICE,
          id: DID,
          issuer: DID,
          name: 'Svc',
          type: 'Svc',
          description: 'A',
          minimumAgeRequired: 0,
          termsAndConditions: 'https://example.com/terms',
          privacyPolicy: 'https://example.com/privacy',
        } as any,
        validPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-multi-c-vp`,
            vpUrl: 'https://example.com/vp-multi',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:svc-OK'],
          },
        ],
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-multi-c-vp`, // SAME serviceId as validPresentations
            vpUrl: 'https://example.com/vp-multi',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:org-FAIL'],
            errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
            errorMessage: 'no ISSUER',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.credentials).toHaveLength(1);
    expect(result.credentials[0].ecsType).toBe('ECS-SERVICE');
    expect(result.failedCredentials).toHaveLength(1);
    expect(result.failedCredentials[0].id).toBe('urn:uuid:org-FAIL');
    expect(result.dereferenceErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-VP outcome arrays surfaced in the response (verana-indexer#227).
//
// These tests assert the *new* public contract: every linked-vp service
// entry on the queried DID Document MUST be reflected in either
// `validPresentations[]`, `invalidPresentations[]`, or both (partially
// valid). They are independent of the legacy `dereferenceErrors[]` /
// `failedCredentials[]` projections — a single resolution must populate
// both shapes in lockstep so existing consumers and new consumers can
// each see a complete, internally consistent picture.
// ---------------------------------------------------------------------------

describe('buildTrustResult — validPresentations[] / invalidPresentations[] (verana-indexer#227)', () => {
  it('surfaces every successful linked-vp as a ValidPresentation with id = vpUrl', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        service: {
          schemaType: ECS.SERVICE,
          id: 'urn:uuid:svc',
          issuer: DID,
          name: 'Svc',
          type: 'Svc',
          description: 'A',
          minimumAgeRequired: 0,
          termsAndConditions: 'https://example.com/terms',
          privacyPolicy: 'https://example.com/privacy',
        } as any,
        validPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-service-vtc-vp`,
            vpUrl: 'https://avatar.eafit.testnet.verana.network/vt/schemas-service-vtc-vp.json',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:svc'],
          },
          {
            serviceId: `${DID}#vpr-schemas-org-vtc-vp`,
            vpUrl: 'https://organization.eafit.testnet.verana.network/vt/schemas-org-vtc-vp.json',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:org'],
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.validPresentations).toEqual([
      {
        id: 'https://avatar.eafit.testnet.verana.network/vt/schemas-service-vtc-vp.json',
        credentialIds: ['urn:uuid:svc'],
        serviceId: `${DID}#vpr-schemas-service-vtc-vp`,
        presentationType: PresentationType.VTC,
      },
      {
        id: 'https://organization.eafit.testnet.verana.network/vt/schemas-org-vtc-vp.json',
        credentialIds: ['urn:uuid:org'],
        serviceId: `${DID}#vpr-schemas-org-vtc-vp`,
        presentationType: PresentationType.VTC,
      },
    ]);
    expect(result.invalidPresentations).toEqual([]);
  });

  it('surfaces VP-level failures on invalidPresentations[] AND dereferenceErrors[] simultaneously', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-service-vtc-vp`,
            vpUrl: 'https://example.com/vp-bad-sig',
            presentationType: PresentationType.VTC,
            credentialIds: [],
            errorCode: TrustErrorCode.VP_SIGNATURE_INVALID,
            errorMessage: 'signature did not verify',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    // New contract: VP-level failure on the public array.
    expect(result.invalidPresentations).toEqual([
      {
        id: 'https://example.com/vp-bad-sig',
        errorCode: TrustErrorCode.VP_SIGNATURE_INVALID,
        errorMessage: 'signature did not verify',
        credentialIds: [],
        serviceId: `${DID}#vpr-schemas-service-vtc-vp`,
        presentationType: PresentationType.VTC,
      },
    ]);
    // Legacy contract: same data still on dereferenceErrors[] for back-compat.
    expect(result.dereferenceErrors).toHaveLength(1);
    expect(result.dereferenceErrors[0].errorCode).toBe(TrustErrorCode.VP_SIGNATURE_INVALID);
    // Credential-level legacy bucket stays empty.
    expect(result.failedCredentials).toEqual([]);
  });

  it('surfaces credential-level failures on invalidPresentations[] AND failedCredentials[]', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-org-vtc-vp`,
            vpUrl: 'https://example.com/vp-bad-issuer',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:cred-1'],
            errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
            errorMessage: 'issuer not permissioned',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    // New contract: ONE entry per (VP, errorCode) pair on the public array,
    // carrying the failing credential id.
    expect(result.invalidPresentations).toHaveLength(1);
    expect(result.invalidPresentations[0]).toEqual({
      id: 'https://example.com/vp-bad-issuer',
      errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
      errorMessage: 'issuer not permissioned',
      credentialIds: ['urn:uuid:cred-1'],
      serviceId: `${DID}#vpr-schemas-org-vtc-vp`,
      presentationType: PresentationType.VTC,
    });
    // Legacy contract: one failedCredentials entry per credentialId; VP-level
    // bucket stays empty since the VP itself was processable.
    expect(result.failedCredentials).toHaveLength(1);
    expect(result.failedCredentials[0].id).toBe('urn:uuid:cred-1');
    expect(result.dereferenceErrors).toEqual([]);
  });

  it('reports a partially-valid VP in BOTH arrays with disjoint credential IDs (verana-indexer#227 example)', () => {
    // The canonical test case from the issue: a single multi-credential
    // VP whose SERVICE credential passes and whose ORG credential fails
    // with `ISSUER_PERMISSION_MISSING` MUST appear once in
    // `validPresentations` (with the OK credential) and once in
    // `invalidPresentations` (with the failing credential), the two
    // entries sharing the same `id`.
    const VP_URL = 'https://example.com/vp-multi';
    const SERVICE_ID = `${DID}#vpr-schemas-multi-vtc-vp`;
    const result = buildTrustResult(
      DID,
      baseResolution({
        service: {
          schemaType: ECS.SERVICE,
          id: 'urn:uuid:svc-OK',
          issuer: DID,
          name: 'Svc',
          type: 'Svc',
          description: 'A',
          minimumAgeRequired: 0,
          termsAndConditions: 'https://example.com/terms',
          privacyPolicy: 'https://example.com/privacy',
        } as any,
        validPresentations: [
          {
            serviceId: SERVICE_ID,
            vpUrl: VP_URL,
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:svc-OK'],
          },
        ],
        invalidPresentations: [
          {
            serviceId: SERVICE_ID,
            vpUrl: VP_URL,
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:org-FAIL'],
            errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
            errorMessage: 'no ISSUER',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.validPresentations).toHaveLength(1);
    expect(result.invalidPresentations).toHaveLength(1);
    // Same VP id in both arrays — this is the explicit co-existence rule.
    expect(result.validPresentations[0].id).toBe(VP_URL);
    expect(result.invalidPresentations[0].id).toBe(VP_URL);
    // Disjoint credential IDs.
    expect(result.validPresentations[0].credentialIds).toEqual(['urn:uuid:svc-OK']);
    expect(result.invalidPresentations[0].credentialIds).toEqual(['urn:uuid:org-FAIL']);
  });

  it('emits a separate invalidPresentations entry per (VP, errorCode) pair when one VP has multiple distinct failures', () => {
    // Per verana-indexer#227 example, a multi-credential VP whose
    // credentials fail with different error codes is split into one
    // entry per error code (not one per credential) so consumers can
    // group by failure mode.
    const VP_URL = 'https://example.com/vp-multi-error';
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-multi-vtc-vp`,
            vpUrl: VP_URL,
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:cred-revoked'],
            errorCode: 'CREDENTIAL_REVOKED' as TrustErrorCode,
            errorMessage: 'revoked',
          },
          {
            serviceId: `${DID}#vpr-schemas-multi-vtc-vp`,
            vpUrl: VP_URL,
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:cred-bad-issuer'],
            errorCode: TrustErrorCode.ISSUER_PERMISSION_MISSING,
            errorMessage: 'no ISSUER',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.invalidPresentations).toHaveLength(2);
    expect(result.invalidPresentations.map((p) => p.errorCode).sort()).toEqual(
      ['CREDENTIAL_REVOKED', TrustErrorCode.ISSUER_PERMISSION_MISSING].sort(),
    );
  });

  it('preserves the v3 legacy fragment as-is — verre is the source of truth for fragment classification', () => {
    // The resolver MUST NOT re-parse the fragment; it MUST surface
    // whatever verre classified, including legacy `-c-vp` / `-jsc-vp`
    // suffixes (verana-indexer#227 acceptance criterion: "Spec v4 and
    // spec v3 fragment forms are both accepted and treated equivalently").
    const result = buildTrustResult(
      DID,
      baseResolution({
        service: {
          schemaType: ECS.SERVICE,
          id: 'urn:uuid:svc',
          issuer: DID,
          name: 'Svc',
          type: 'Svc',
          description: 'A',
          minimumAgeRequired: 0,
          termsAndConditions: 'https://example.com/terms',
          privacyPolicy: 'https://example.com/privacy',
        } as any,
        validPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-service-c-vp`, // legacy v3 suffix
            vpUrl: 'https://example.com/vp-legacy',
            presentationType: PresentationType.VTC,
            credentialIds: ['urn:uuid:svc'],
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.validPresentations[0].serviceId).toBe(`${DID}#vpr-schemas-service-c-vp`);
    expect(result.validPresentations[0].presentationType).toBe(PresentationType.VTC);
  });
});

describe('buildTrustResult — backward compatibility', () => {
  it('falls back to the legacy single-failedCredential entry when verre returns no per-VP arrays', () => {
    // Simulate a verre version that does not yet populate validPresentations/
    // invalidPresentations (e.g. a top-level DID resolution failure).
    const result = buildTrustResult(
      DID,
      {
        didDocument: { id: DID } as any,
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        metadata: {
          errorCode: 'NOT_FOUND',
          errorMessage: 'DID resolution failed for did:web:vs.example.com',
        } as any,
      } as TrustResolution,
      CURRENT_BLOCK,
      TTL,
    );

    expect(result.failedCredentials).toHaveLength(1);
    expect(result.failedCredentials[0]).toEqual({
      id: DID,
      format: 'N/A',
      error: 'DID resolution failed for did:web:vs.example.com',
      errorCode: 'NOT_FOUND',
    });
    expect(result.dereferenceErrors).toEqual([]);
  });

  it('does NOT add the fallback failedCredential when invalidPresentations is populated', () => {
    const result = buildTrustResult(
      DID,
      baseResolution({
        verified: false,
        outcome: TrustResolutionOutcome.INVALID,
        metadata: {
          errorCode: 'NOT_FOUND',
          errorMessage: 'top-level',
        } as any,
        invalidPresentations: [
          {
            serviceId: `${DID}#vpr-schemas-service-c-vp`,
            vpUrl: 'https://example.com/vp',
            presentationType: PresentationType.VTC,
            credentialIds: [],
            errorCode: TrustErrorCode.DEREFERENCE_FAILED,
            errorMessage: 'no fetch',
          },
        ],
      }),
      CURRENT_BLOCK,
      TTL,
    );

    // Only the dereference error is present; the fallback is suppressed.
    expect(result.failedCredentials).toEqual([]);
    expect(result.dereferenceErrors).toHaveLength(1);
  });
});
