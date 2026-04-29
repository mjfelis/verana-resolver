import {
  resolveDID as verreResolveDID,
  TrustResolutionOutcome,
  TrustErrorCode,
  ECS,
  type VerifiablePublicRegistry,
  type TrustResolution,
  type ICredential,
  type IService,
  type IOrg,
  type IPersona,
  type IUserAgent,
  type VpOutcome,
  type VpOutcomeWithError,
} from '@verana-labs/verre';
import type { IndexerClient } from '../indexer/client.js';
import { deleteCachedFile } from '../cache/file-cache.js';
import { upsertTrustResult, markUntrusted } from '../trust/trust-store.js';
import { addReattemptable } from './reattemptable.js';
import type {
  TrustResult,
  TrustStatus,
  CredentialEvaluation,
  FailedCredential,
  VPDereferenceError,
  ValidPresentation,
  InvalidPresentation,
  EcsType,
} from '../trust/types.js';
import { verreLogger } from '../trust/verre-logger.js';
import { createLogger } from '../logger.js';

const logger = createLogger('verre-pass');

// ---------------------------------------------------------------------------
// Outcome → TrustStatus mapping
// ---------------------------------------------------------------------------

function mapOutcomeToTrustStatus(outcome: TrustResolutionOutcome, verified: boolean): TrustStatus {
  if (!verified) return 'UNTRUSTED';
  switch (outcome) {
    case TrustResolutionOutcome.VERIFIED:
    case TrustResolutionOutcome.VERIFIED_TEST:
      return 'TRUSTED';
    case TrustResolutionOutcome.NOT_TRUSTED:
      return 'UNTRUSTED';
    case TrustResolutionOutcome.INVALID:
      return 'UNTRUSTED';
    default:
      return 'UNTRUSTED';
  }
}

function mapOutcomeToProduction(outcome: TrustResolutionOutcome, verified: boolean): boolean {
  if (!verified) return false;
  return outcome === TrustResolutionOutcome.VERIFIED;
}

// ---------------------------------------------------------------------------
// ICredential → CredentialEvaluation mapping
// ---------------------------------------------------------------------------

function mapEcsType(schemaType: ICredential['schemaType']): EcsType {
  switch (schemaType) {
    case ECS.SERVICE:
      return 'ECS-SERVICE';
    case ECS.ORG:
      return 'ECS-ORG';
    case ECS.PERSONA:
      return 'ECS-PERSONA';
    case ECS.USER_AGENT:
      return 'ECS-UA';
    default:
      return null;
  }
}

function extractClaimsFromCredential(cred: ICredential): Record<string, unknown> {
  const claims: Record<string, unknown> = { id: cred.id, issuer: cred.issuer };

  switch (cred.schemaType) {
    case ECS.SERVICE: {
      const svc = cred as IService;
      claims.name = svc.name;
      claims.type = svc.type;
      claims.description = svc.description;
      claims.minimumAgeRequired = svc.minimumAgeRequired;
      claims.termsAndConditions = svc.termsAndConditions;
      claims.termsAndConditionsDigestSri = svc.termsAndConditionsDigestSri;
      claims.privacyPolicy = svc.privacyPolicy;
      claims.privacyPolicyDigestSri = svc.privacyPolicyDigestSri;
      break;
    }
    case ECS.ORG: {
      const org = cred as IOrg;
      claims.name = org.name;
      claims.registryId = org.registryId;
      claims.registryUri = org.registryUri;
      claims.address = org.address;
      claims.countryCode = org.countryCode;
      claims.legalJurisdiction = org.legalJurisdiction;
      claims.lei = org.lei;
      claims.organizationKind = org.organizationKind;
      break;
    }
    case ECS.PERSONA: {
      const persona = cred as IPersona;
      claims.name = persona.name;
      claims.controllerCountryCode = persona.controllerCountryCode;
      claims.controllerJurisdiction = persona.controllerJurisdiction;
      claims.description = persona.description;
      break;
    }
    case ECS.USER_AGENT: {
      const ua = cred as IUserAgent;
      claims.version = ua.version;
      claims.build = ua.build;
      break;
    }
    default: {
      // Unknown credential — copy all extra keys as claims
      const { schemaType: _st, id: _id, issuer: _iss, ...rest } = cred as Record<string, unknown>;
      Object.assign(claims, rest);
      break;
    }
  }

  return claims;
}

function credentialToEvaluation(cred: ICredential, presentedBy: string): CredentialEvaluation {
  const ecsType = mapEcsType(cred.schemaType);
  const result = ecsType !== null ? ('VALID' as const) : ('IGNORED' as const);

  return {
    result,
    ecsType,
    presentedBy,
    issuedBy: cred.issuer,
    id: cred.id,
    type: 'VerifiableTrustCredential',
    format: 'W3C_VTC',
    claims: extractClaimsFromCredential(cred),
    permissionChain: [],
  };
}

// ---------------------------------------------------------------------------
// Per-VP outcome partitioning
// ---------------------------------------------------------------------------

/**
 * Error codes that describe a VP-level failure (the entire presentation
 * could not be processed). All other invalid-presentation entries are
 * credential-level (one or more credentials inside an otherwise-OK VP
 * failed validation) and are surfaced under `failedCredentials`.
 */
const VP_LEVEL_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  TrustErrorCode.DEREFERENCE_FAILED,
  TrustErrorCode.VP_SIGNATURE_INVALID,
  TrustErrorCode.VP_NO_CREDENTIALS,
  TrustErrorCode.FRAGMENT_NOT_CONFORMANT,
  // Generic legacy codes used at the VP layer (kept for backward compat
  // with verre versions that have not yet adopted the fine-grained
  // VP-level codes above).
  TrustErrorCode.NOT_SUPPORTED,
  TrustErrorCode.INVALID_REQUEST,
]);

/**
 * Decide whether an `invalidPresentations` entry describes a VP-level
 * failure (no credentials extracted) or a credential-level failure
 * (one or more credentials in the VP failed validation). The decision
 * is driven primarily by `credentialIds.length`, with the explicit
 * `VP_LEVEL_ERROR_CODES` set as a fallback for entries where the VP
 * failed before any credentials could be enumerated (e.g. signature
 * invalid, fetch error).
 */
export function isVpLevelFailure(entry: VpOutcomeWithError): boolean {
  if (entry.credentialIds.length === 0) return true;
  return VP_LEVEL_ERROR_CODES.has(entry.errorCode);
}

// ---------------------------------------------------------------------------
// Build TrustResult from verre TrustResolution
// ---------------------------------------------------------------------------

export function buildTrustResult(
  did: string,
  resolution: TrustResolution,
  currentBlock: number,
  cacheTtlSeconds: number,
): TrustResult {
  const trustStatus = mapOutcomeToTrustStatus(resolution.outcome, resolution.verified);
  const production = mapOutcomeToProduction(resolution.outcome, resolution.verified);
  const now = new Date();

  const credentials: CredentialEvaluation[] = [];
  const failedCredentials: FailedCredential[] = [];
  const dereferenceErrors: VPDereferenceError[] = [];

  // Per-VP outcome arrays surfaced verbatim in the response, aligned with
  // verana-indexer#227. Each linked-vp service entry on the queried DID
  // Document contributes at most one `ValidPresentation` (when at least
  // one credential inside passed validation) and zero or more
  // `InvalidPresentation` entries (one per (VP, errorCode) pair). A
  // partially-valid VP intentionally appears in both arrays so consumers
  // can see precisely which credentials inside it passed and which did
  // not without losing per-credential granularity.
  const validPresentationsOut: ValidPresentation[] = (resolution.validPresentations ?? []).map(
    (vp: VpOutcome) => ({
      id: vp.vpUrl,
      credentialIds: [...vp.credentialIds],
      serviceId: vp.serviceId,
      presentationType: vp.presentationType,
    }),
  );
  const invalidPresentationsOut: InvalidPresentation[] = [];

  // Map verified service credential (ECS-SERVICE).
  if (resolution.service) {
    credentials.push(credentialToEvaluation(resolution.service, did));
  }

  // Map verified serviceProvider credential (ECS-ORG / ECS-PERSONA).
  // When the SERVICE credential is issued externally (VS-REQ-4) the
  // serviceProvider was resolved from the issuer's DID Document and is
  // presented by the issuer DID, not the queried DID.
  if (resolution.serviceProvider) {
    const providerPresentedBy =
      resolution.service && resolution.service.issuer !== did ? resolution.service.issuer : did;
    credentials.push(credentialToEvaluation(resolution.serviceProvider, providerPresentedBy));
  }

  // Project the per-VP / per-credential `invalidPresentations` array onto
  // the resolver's two failure buckets:
  //
  //   * VP-level failures  → `dereferenceErrors`
  //   * credential failures → `failedCredentials` (one entry per failing
  //     credential id, with the verre error code preserved verbatim)
  //
  // This is the key behavioural change of the per-VP refactor — a multi-
  // credential VP whose only flaw is a missing ISSUER permission on one
  // of its credentials no longer poisons the entire presentation; the
  // passing credentials show up under `credentials` and the failing
  // credential shows up under `failedCredentials` with `errorCode`
  // pinpointing the broken rule.
  const invalidPresentations = resolution.invalidPresentations ?? [];
  for (const entry of invalidPresentations) {
    // Always surface the entry verbatim on `invalidPresentations[]` —
    // this is the public contract per verana-indexer#227. The legacy
    // `dereferenceErrors[]` and `failedCredentials[]` arrays below are
    // back-compat projections of the same data.
    invalidPresentationsOut.push({
      id: entry.vpUrl,
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
      credentialIds: [...entry.credentialIds],
      serviceId: entry.serviceId,
      presentationType: entry.presentationType,
    });

    if (isVpLevelFailure(entry)) {
      dereferenceErrors.push({
        vpUrl: entry.vpUrl,
        error: entry.errorMessage,
        errorCode: entry.errorCode,
        serviceId: entry.serviceId,
        presentationType: entry.presentationType,
      });
      continue;
    }
    // Credential-level failure: emit one FailedCredential per credentialId.
    for (const credentialId of entry.credentialIds) {
      failedCredentials.push({
        id: credentialId,
        uri: entry.vpUrl,
        format: entry.presentationType === 'vtjsc' ? 'W3C_VTJSC' : 'W3C_VTC',
        error: entry.errorMessage,
        errorCode: entry.errorCode,
        serviceId: entry.serviceId,
        presentationType: entry.presentationType,
      });
    }
  }

  // Fallback: if verre returned a top-level error but did not populate
  // any per-VP outcome arrays (older verre or non-DID-Document errors
  // such as DID resolution failure), preserve the legacy single-entry
  // `failedCredentials` behaviour so callers always see a reason.
  if (
    !resolution.verified &&
    resolution.metadata &&
    invalidPresentations.length === 0 &&
    failedCredentials.length === 0 &&
    dereferenceErrors.length === 0
  ) {
    failedCredentials.push({
      id: did,
      format: 'N/A',
      error: resolution.metadata.errorMessage ?? 'Trust resolution failed',
      errorCode: resolution.metadata.errorCode ?? 'VERRE_RESOLUTION_FAILED',
    });
  }

  return {
    did,
    trustStatus,
    production,
    evaluatedAt: now.toISOString(),
    evaluatedAtBlock: currentBlock,
    expiresAt: new Date(now.getTime() + cacheTtlSeconds * 1000).toISOString(),
    credentials,
    failedCredentials,
    dereferenceErrors,
    validPresentations: validPresentationsOut,
    invalidPresentations: invalidPresentationsOut,
  };
}

// ---------------------------------------------------------------------------
// Unified pass: replaces runPass1 + runPass2
// ---------------------------------------------------------------------------

/**
 * Optional knobs for `runVerrePass` that control resilience and
 * observability without changing the (already-busy) positional
 * parameter list.
 */
export interface RunVerrePassOptions {
  /**
   * Maximum time (ms) any single `verreResolveDID` call may take
   * before the pass abandons that DID and continues with the next.
   *
   * The default value is intentionally larger than verre's own HTTP
   * fetch timeout so a DID that chains several legitimate sequential
   * fetches (DID log + multiple VPs + VCs + permission checks) can
   * still complete. Even with verre's 15s per-fetch ceiling, a DID
   * with N fetches can take up to ~15·N seconds, so the resolver-side
   * deadline acts as a final guard.
   *
   * Set to `0` to disable the deadline (rely solely on verre's
   * fetch timeout). Defaults to `60000` when omitted.
   */
  perDidTimeoutMs?: number;

  /**
   * Emit a `Verre pass progress` `info` log every N completed DIDs.
   * Without this, an `info`-level operator sees `Verre pass started`
   * and then nothing until the entire pass finishes, with no way to
   * tell which DID is in flight.
   *
   * Set to `0` to suppress progress logs (start/complete logs still
   * fire). Defaults to `10` when omitted.
   */
  progressLogEvery?: number;
}

/**
 * Sentinel error thrown by `withDeadline` when the per-DID deadline
 * fires. Caught and translated into a structured `failed` entry by
 * the main loop so timeouts do not bubble as generic errors.
 */
class PerDidDeadlineExceededError extends Error {
  constructor(
    readonly did: string,
    readonly deadlineMs: number,
  ) {
    super(`Per-DID deadline of ${deadlineMs}ms exceeded for ${did}`);
    this.name = 'PerDidDeadlineExceededError';
  }
}

/**
 * Race a verre call against a per-DID timer. When `deadlineMs` is `0`
 * the timer is skipped and the original promise is returned as-is so
 * the caller can opt into "no resolver-side deadline".
 *
 * Implementation detail: `setTimeout(..., 0)` would fire immediately,
 * so the disabled path is gated explicitly rather than encoded as
 * "0ms timer". The timer is also cleared if the original promise
 * settles first, to avoid leaking a long-running unref-by-default
 * Node.js timer into the event loop.
 */
function withDeadline<T>(promise: Promise<T>, deadlineMs: number, did: string): Promise<T> {
  if (deadlineMs <= 0) return promise;

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PerDidDeadlineExceededError(did, deadlineMs)), deadlineMs);
  });

  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeoutPromise,
  ]);
}

export async function runVerrePass(
  affectedDids: Set<string>,
  _indexer: IndexerClient,
  currentBlock: number,
  trustTtlSeconds: number,
  verifiablePublicRegistries: VerifiablePublicRegistry[],
  skipDigestSRICheck: boolean,
  options: RunVerrePassOptions = {},
): Promise<{ succeeded: string[]; failed: string[]; timedOut: string[] }> {
  const perDidTimeoutMs = options.perDidTimeoutMs ?? 60_000;
  const progressLogEvery = options.progressLogEvery ?? 10;

  const succeeded: string[] = [];
  const failed: string[] = [];
  // `timedOut` is a strict subset of `failed`; surfaced separately so
  // operators can tell timeout-driven failures from logic-driven ones.
  const timedOut: string[] = [];

  const passStart = Date.now();
  let processed = 0;

  logger.info(
    {
      didCount: affectedDids.size,
      block: currentBlock,
      perDidTimeoutMs,
      progressLogEvery,
    },
    'Verre pass started — DID resolution + trust evaluation',
  );

  for (const did of affectedDids) {
    const didStart = Date.now();

    try {
      // 1. Invalidate cached DID Document (same as old Pass1)
      logger.debug({ did }, 'Invalidating cached DID document');
      await deleteCachedFile(did);

      // 2. Single verre call, gated by the per-DID deadline. Even with
      // verre's own per-fetch HTTP timeout, an adversarial DID could
      // chain enough fetches to multiply the wall-clock cost; the
      // deadline below is the last line of defence against a slow DID
      // starving the rest of the pass.
      logger.debug({ did, perDidTimeoutMs }, 'Calling verre resolveDID');
      const resolution = await withDeadline(
        verreResolveDID(did, {
          verifiablePublicRegistries,
          skipDigestSRICheck,
          logger: verreLogger,
        }),
        perDidTimeoutMs,
        did,
      );

      logger.debug(
        {
          did,
          verified: resolution.verified,
          outcome: resolution.outcome,
          hasService: !!resolution.service,
          hasServiceProvider: !!resolution.serviceProvider,
          errorCode: resolution.metadata?.errorCode,
          errorMessage: resolution.metadata?.errorMessage,
          elapsedMs: Date.now() - didStart,
        },
        'Verre resolveDID complete',
      );

      // 3. Map verre result to TrustResult and store
      const trustResult = buildTrustResult(did, resolution, currentBlock, trustTtlSeconds);
      await upsertTrustResult(trustResult);

      logger.info(
        {
          did,
          trustStatus: trustResult.trustStatus,
          production: trustResult.production,
          validCredentials: trustResult.credentials.filter((c) => c.result === 'VALID').length,
          failedCredentials: trustResult.failedCredentials.length,
          dereferenceErrors: trustResult.dereferenceErrors.length,
          elapsedMs: Date.now() - didStart,
        },
        'Verre pass: DID processed and trust stored',
      );

      succeeded.push(did);
    } catch (err) {
      const elapsedMs = Date.now() - didStart;

      if (err instanceof PerDidDeadlineExceededError) {
        // Distinct log path so dashboards / log-based alerting can pick
        // up "stuck DID" cases without false-positives from logic
        // failures (bad VP signature, missing permission, …).
        logger.warn(
          { did, deadlineMs: err.deadlineMs, elapsedMs },
          'Verre pass: per-DID deadline exceeded — skipping DID, will retry next pass',
        );
        timedOut.push(did);
      } else {
        logger.error({ did, err, elapsedMs }, 'Verre pass: unexpected error');
      }

      // On any failure (timeout or otherwise), mark as reattemptable
      // and UNTRUSTED so the next pass picks the DID back up. This
      // preserves the previous semantics while letting the loop
      // continue past a single bad DID.
      await addReattemptable(did, 'TRUST_EVAL', 'TRANSIENT');
      await markUntrusted(did, currentBlock, trustTtlSeconds);
      failed.push(did);
    }

    processed++;
    if (progressLogEvery > 0 && processed % progressLogEvery === 0) {
      logger.info(
        {
          processed,
          total: affectedDids.size,
          succeeded: succeeded.length,
          failed: failed.length,
          timedOut: timedOut.length,
          elapsedMs: Date.now() - passStart,
        },
        'Verre pass progress',
      );
    }
  }

  logger.info(
    {
      succeeded: succeeded.length,
      failed: failed.length,
      timedOut: timedOut.length,
      block: currentBlock,
      elapsedMs: Date.now() - passStart,
    },
    'Verre pass complete',
  );
  return { succeeded, failed, timedOut };
}
