import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks installed BEFORE the SUT import (vi.hoisted ensures the mock
// factory runs in time). The SUT only imports each helper as a function, so a
// shallow mock that returns vi.fn()'s is sufficient.
// ---------------------------------------------------------------------------

const { resolveDIDMock, deleteCachedFileMock, upsertTrustResultMock, markUntrustedMock, addReattemptableMock, warnMock, infoMock, errorMock } =
  vi.hoisted(() => ({
    resolveDIDMock: vi.fn(),
    deleteCachedFileMock: vi.fn(),
    upsertTrustResultMock: vi.fn(),
    markUntrustedMock: vi.fn(),
    addReattemptableMock: vi.fn(),
    warnMock: vi.fn(),
    infoMock: vi.fn(),
    errorMock: vi.fn(),
  }));

vi.mock('@verana-labs/verre', async (orig) => {
  const real = await orig<typeof import('@verana-labs/verre')>();
  return {
    ...real,
    resolveDID: resolveDIDMock,
  };
});

vi.mock('../src/cache/file-cache.js', () => ({
  deleteCachedFile: deleteCachedFileMock,
}));

vi.mock('../src/trust/trust-store.js', () => ({
  upsertTrustResult: upsertTrustResultMock,
  markUntrusted: markUntrustedMock,
}));

vi.mock('../src/polling/reattemptable.js', () => ({
  addReattemptable: addReattemptableMock,
}));

vi.mock('../src/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: infoMock,
    warn: warnMock,
    error: errorMock,
    fatal: vi.fn(),
    trace: vi.fn(),
  }),
}));

import { TrustResolutionOutcome } from '@verana-labs/verre';
import { runVerrePass } from '../src/polling/verre-pass.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_INDEXER = {} as Parameters<typeof runVerrePass>[1];

const VPR_REGISTRIES = [
  {
    id: 'vpr:verana:vna-testnet-1',
    baseUrls: ['https://idx.testnet.verana.network/verana'],
    production: true,
  },
];

function buildVerifiedResolution() {
  return {
    verified: true,
    outcome: TrustResolutionOutcome.VERIFIED,
    service: undefined,
    serviceProvider: undefined,
    invalidPresentations: [],
    metadata: undefined,
  };
}

function flatten(mock: typeof infoMock): string {
  return mock.mock.calls
    .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runVerrePass — per-DID deadline', () => {
  beforeEach(() => {
    resolveDIDMock.mockReset();
    deleteCachedFileMock.mockReset();
    upsertTrustResultMock.mockReset();
    markUntrustedMock.mockReset();
    addReattemptableMock.mockReset();
    warnMock.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves all DIDs to `succeeded` when each verre call returns under the deadline', async () => {
    resolveDIDMock.mockImplementation(async () => buildVerifiedResolution());

    const dids = new Set(['did:web:a.example.com', 'did:web:b.example.com', 'did:web:c.example.com']);
    const result = await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 1_000,
      progressLogEvery: 0, // suppress progress logs for this case
    });

    expect(result.succeeded.sort()).toEqual([...dids].sort());
    expect(result.failed).toEqual([]);
    expect(result.timedOut).toEqual([]);
    expect(upsertTrustResultMock).toHaveBeenCalledTimes(3);
  });

  it('moves on to the next DID after the deadline fires for one slow DID, marking it timedOut + failed', async () => {
    // First DID hangs forever; second resolves immediately.
    resolveDIDMock.mockImplementation(async (did: string) => {
      if (did === 'did:web:slow.example.com') {
        await new Promise(() => {
          /* never resolves — simulates the unreachable VPN endpoint */
        });
      }
      return buildVerifiedResolution();
    });

    const dids = new Set(['did:web:slow.example.com', 'did:web:fast.example.com']);
    const result = await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 25, // small enough to fire promptly under vitest
      progressLogEvery: 0,
    });

    expect(result.succeeded).toEqual(['did:web:fast.example.com']);
    expect(result.timedOut).toEqual(['did:web:slow.example.com']);
    expect(result.failed).toEqual(['did:web:slow.example.com']);

    // Timeout path: warn (not error), reattemptable + UNTRUSTED markers.
    const warnLog = flatten(warnMock);
    expect(warnLog).toContain('per-DID deadline exceeded');
    expect(warnLog).toContain('did:web:slow.example.com');
    expect(addReattemptableMock).toHaveBeenCalledWith('did:web:slow.example.com', 'TRUST_EVAL', 'TRANSIENT');
    expect(markUntrustedMock).toHaveBeenCalledWith('did:web:slow.example.com', 100, 3600);
    // Fast DID was processed normally.
    expect(upsertTrustResultMock).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('disables the deadline when perDidTimeoutMs=0, allowing slow but eventual completion', async () => {
    let resolveSlow!: (v: ReturnType<typeof buildVerifiedResolution>) => void;
    resolveDIDMock.mockImplementation((did: string) => {
      if (did === 'did:web:slowish.example.com') {
        return new Promise((res) => {
          resolveSlow = res as never;
        });
      }
      return Promise.resolve(buildVerifiedResolution());
    });

    const dids = new Set(['did:web:slowish.example.com']);
    const passPromise = runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 0, // disabled
      progressLogEvery: 0,
    });

    // Give the test a small window to ensure no premature timeout fires.
    await new Promise((res) => setTimeout(res, 30));
    resolveSlow(buildVerifiedResolution());

    const result = await passPromise;
    expect(result.succeeded).toEqual(['did:web:slowish.example.com']);
    expect(result.timedOut).toEqual([]);
  });

  it('preserves existing semantics for non-timeout errors (logs error, marks failed)', async () => {
    resolveDIDMock.mockImplementation(async () => {
      throw new Error('verre exploded');
    });

    const dids = new Set(['did:web:bad.example.com']);
    const result = await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 1_000,
      progressLogEvery: 0,
    });

    expect(result.succeeded).toEqual([]);
    expect(result.timedOut).toEqual([]);
    expect(result.failed).toEqual(['did:web:bad.example.com']);
    expect(errorMock).toHaveBeenCalled();
    // The warn log is reserved for timeouts; non-timeout failures must NOT use it.
    expect(flatten(warnMock)).not.toContain('per-DID deadline exceeded');
    expect(addReattemptableMock).toHaveBeenCalledOnce();
    expect(markUntrustedMock).toHaveBeenCalledOnce();
  });

  it('uses the default deadline (60_000ms) when options is omitted', async () => {
    resolveDIDMock.mockImplementation(async () => buildVerifiedResolution());
    const dids = new Set(['did:web:default.example.com']);

    const result = await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true);
    expect(result.succeeded).toEqual(['did:web:default.example.com']);

    // The pass-start log records the active deadline so operators / tests can
    // assert the default propagates through.
    const startLog = flatten(infoMock);
    expect(startLog).toContain('Verre pass started');
    expect(startLog).toContain('"perDidTimeoutMs":60000');
  });
});

describe('runVerrePass — progress logging', () => {
  beforeEach(() => {
    resolveDIDMock.mockReset();
    deleteCachedFileMock.mockReset();
    upsertTrustResultMock.mockReset();
    markUntrustedMock.mockReset();
    addReattemptableMock.mockReset();
    warnMock.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();
  });

  it('emits a Verre pass progress log every N completions when progressLogEvery > 0', async () => {
    resolveDIDMock.mockImplementation(async () => buildVerifiedResolution());
    const dids = new Set(Array.from({ length: 7 }, (_, i) => `did:web:d${i}.example.com`));

    await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 1_000,
      progressLogEvery: 3,
    });

    const progressLogs = infoMock.mock.calls
      .map((args) => args.find((a) => typeof a === 'string'))
      .filter((m): m is string => typeof m === 'string' && m.includes('Verre pass progress'));

    // 7 DIDs at every-3 cadence ⇒ progress logs after #3 and #6 (not after #7).
    expect(progressLogs).toHaveLength(2);
  });

  it('emits no progress logs when progressLogEvery=0, but still emits start + complete', async () => {
    resolveDIDMock.mockImplementation(async () => buildVerifiedResolution());
    const dids = new Set(['did:web:a.example.com', 'did:web:b.example.com']);

    await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 1_000,
      progressLogEvery: 0,
    });

    const messages = infoMock.mock.calls
      .map((args) => args.find((a) => typeof a === 'string'))
      .filter((m): m is string => typeof m === 'string');

    expect(messages.some((m) => m.includes('Verre pass started'))).toBe(true);
    expect(messages.some((m) => m.includes('Verre pass complete'))).toBe(true);
    expect(messages.some((m) => m.includes('Verre pass progress'))).toBe(false);
  });

  it('records elapsedMs on the pass-complete log', async () => {
    resolveDIDMock.mockImplementation(async () => buildVerifiedResolution());
    const dids = new Set(['did:web:a.example.com']);

    await runVerrePass(dids, FAKE_INDEXER, 100, 3600, VPR_REGISTRIES, true, {
      perDidTimeoutMs: 1_000,
      progressLogEvery: 0,
    });

    const completeCall = infoMock.mock.calls.find((args) =>
      args.some((a) => typeof a === 'string' && a.includes('Verre pass complete')),
    );
    expect(completeCall).toBeDefined();
    const meta = completeCall![0] as Record<string, unknown>;
    expect(typeof meta.elapsedMs).toBe('number');
    expect(meta.elapsedMs as number).toBeGreaterThanOrEqual(0);
  });
});
