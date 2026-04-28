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
