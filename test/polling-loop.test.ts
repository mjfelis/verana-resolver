import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAffectedDids } from '../src/polling/extract-dids.js';
import type { ActivityItem } from '../src/indexer/types.js';

// --- extractAffectedDids ---

describe('extractAffectedDids', () => {
  it('returns empty set for empty activity', () => {
    expect(extractAffectedDids([]).size).toBe(0);
  });

  it('extracts DID from permission change (new did)', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'Permission',
      entity_id: '1',
      account: 'verana1abc',
      msg: 'MsgCreatePermission',
      changes: {
        did: 'did:web:acme.example.com',
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:acme.example.com')).toBe(true);
  });

  it('extracts DID from permission change (old did \u2014 revoked)', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'Permission',
      entity_id: '1',
      account: 'verana1abc',
      msg: 'MsgRevokePermission',
      changes: {
        did: 'did:web:old.example.com'
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:old.example.com')).toBe(true);
  });

  it('extracts DID from grantee field in permission', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'Permission',
      entity_id: '2',
      account: 'verana1xyz',
      msg: 'MsgGrantPermission',
      changes: {
        grantee: 'did:web:grantee.example.com',
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:grantee.example.com')).toBe(true);
  });

  it('extracts DID from trust_registry change', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'TrustRegistry',
      entity_id: '5',
      account: 'verana1abc',
      msg: 'MsgCreateTrustRegistry',
      changes: {
        did: 'did:web:ecosystem.example.com',
      },
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:ecosystem.example.com')).toBe(true);
  });

  it('extracts DID from account field if it starts with did:', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'credential_schema',
      entity_id: '10',
      account: 'did:web:issuer.example.com',
      msg: 'MsgCreateCredentialSchema',
      changes: {},
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.has('did:web:issuer.example.com')).toBe(true);
  });

  it('deduplicates DIDs across multiple activity items', () => {
    const activity: ActivityItem[] = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'Permission',
        entity_id: '1',
        account: 'verana1abc',
        msg: 'MsgCreatePermission',
        changes: { did: 'did:web:acme.example.com' },
      },
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'Permission',
        entity_id: '2',
        account: 'verana1def',
        msg: 'MsgCreatePermission',
        changes: { did: 'did:web:acme.example.com' },
      },
    ];
    const dids = extractAffectedDids(activity);
    expect(dids.size).toBe(1);
    expect(dids.has('did:web:acme.example.com')).toBe(true);
  });

  it('ignores non-DID accounts', () => {
    const activity: ActivityItem[] = [{
      timestamp: '2026-01-01T00:00:00Z',
      block_height: '100',
      entity_type: 'Permission',
      entity_id: '1',
      account: 'verana1abc123',
      msg: 'MsgCreatePermission',
      changes: {},
    }];
    const dids = extractAffectedDids(activity);
    expect(dids.size).toBe(0);
  });

  it('handles mixed activity types', () => {
    const activity: ActivityItem[] = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'Permission',
        entity_id: '1',
        account: 'verana1abc',
        msg: 'MsgCreatePermission',
        changes: { did: 'did:web:a.example.com' },
      },
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'TrustRegistry',
        entity_id: '5',
        account: 'verana1xyz',
        msg: 'MsgCreateTrustRegistry',
        changes: { did: 'did:web:eco.example.com' },
      },
      {
        timestamp: '2026-01-01T00:00:00Z',
        block_height: '100',
        entity_type: 'credential_schema',
        entity_id: '10',
        account: 'did:web:b.example.com',
        msg: 'MsgCreateCredentialSchema',
        changes: {},
      },
    ];
    const dids = extractAffectedDids(activity);
    expect(dids.size).toBe(3);
    expect(dids.has('did:web:a.example.com')).toBe(true);
    expect(dids.has('did:web:eco.example.com')).toBe(true);
    expect(dids.has('did:web:b.example.com')).toBe(true);
  });
});

// --- pollOnce orchestration ---

describe('pollOnce', () => {
  // Mock all dependencies
  vi.mock('../src/polling/indexer-ws.js', () => ({
    IndexerWebSocket: vi.fn().mockImplementation(() => ({
      waitForBlock: vi.fn().mockResolvedValue(false),
      onBlock: vi.fn().mockReturnValue(() => {}),
      close: vi.fn(),
    })),
  }));

  vi.mock('../src/polling/leader.js', () => ({
    tryAcquireLeaderLock: vi.fn().mockResolvedValue(true),
    releaseLeaderLock: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock('../src/polling/resolver-state.js', () => ({
    getLastProcessedBlock: vi.fn().mockResolvedValue(99),
    setLastProcessedBlock: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock('../src/polling/reattemptable.js', () => ({
    addReattemptable: vi.fn().mockResolvedValue(undefined),
    getRetryEligible: vi.fn().mockResolvedValue([]),
    removeReattemptable: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredRetries: vi.fn().mockResolvedValue([]),
  }));

  vi.mock('../src/db/index.js', () => ({
    getPool: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }),
  }));

  vi.mock('../src/polling/verre-pass.js', () => ({
    runVerrePass: vi.fn().mockResolvedValue({ succeeded: ['did:web:test.example.com'], failed: [] }),
  }));

  vi.mock('../src/trust/trust-store.js', () => ({
    upsertTrustResult: vi.fn().mockResolvedValue(undefined),
    markUntrusted: vi.fn().mockResolvedValue(undefined),
    getSummaryTrustResult: vi.fn(),
    getFullTrustResult: vi.fn(),
  }));

  vi.mock('../src/cache/file-cache.js', () => ({
    deleteCachedFile: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue(null),
    setState: vi.fn().mockResolvedValue(undefined),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes blocks and returns counts', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock, setLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');

    vi.mocked(getLastProcessedBlock).mockResolvedValue(99);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 101 }),
      listChanges: vi.fn()
        .mockResolvedValueOnce({
          block_height: 100,
          activity: [{
            timestamp: '2026-01-01T00:00:00Z',
            block_height: '100',
            entity_type: 'Permission',
            entity_id: '1',
            account: 'verana1abc',
            msg: 'MsgCreatePermission',
            changes: { did: 'did:web:test.example.com' },
          }],
        })
        .mockResolvedValueOnce({
          block_height: 101,
          activity: [],
        }),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      TRUST_TTL_REFRESH_RATIO: 0.2,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      VPR_REGISTRIES: '[]',
      DISABLE_DIGEST_SRI_VERIFICATION: false,
    } as any;

    const result = await pollOnce(mockIndexer, config);

    expect(result.blocksProcessed).toBe(2);
    expect(result.didsAffected).toBeGreaterThanOrEqual(1);
    expect(setLastProcessedBlock).toHaveBeenCalledWith(101);
  });

  it('returns zero when no new blocks', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');

    vi.mocked(getLastProcessedBlock).mockResolvedValue(100);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 100 }),
      listChanges: vi.fn(),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      TRUST_TTL_REFRESH_RATIO: 0.2,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      VPR_REGISTRIES: '[]',
      DISABLE_DIGEST_SRI_VERIFICATION: false,
    } as any;

    const result = await pollOnce(mockIndexer, config);
    expect(result.blocksProcessed).toBe(0);
    expect(result.didsAffected).toBe(0);
    expect(mockIndexer.listChanges).not.toHaveBeenCalled();
  });

  it('fast-forwards across empty ranges using next_change_at', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock, setLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');
    const { runVerrePass } = await import('../src/polling/verre-pass.js');

    // Resolver is at block 803_599 ; chain head is 883_490 (next activity).
    // Empty range = 79_891 blocks. Without the optimization the resolver
    // would issue 79_891 listChanges calls; with it, exactly two.
    vi.mocked(getLastProcessedBlock).mockResolvedValue(803_599);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 883_490 }),
      listChanges: vi.fn()
        // First call: block 803_600 has no activity, indexer points at 883_490.
        .mockResolvedValueOnce({
          block_height: 803_600,
          next_change_at: 883_490,
          activity: [],
        })
        // After fast-forward, the loop targets 883_490 and finds activity.
        .mockResolvedValueOnce({
          block_height: 883_490,
          activity: [{
            timestamp: '2026-04-28T00:00:00Z',
            block_height: '883490',
            entity_type: 'Permission',
            entity_id: '1',
            account: 'verana1abc',
            msg: 'MsgCreatePermission',
            changes: { did: 'did:web:test.example.com' },
          }],
        }),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      TRUST_TTL_REFRESH_RATIO: 0.2,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      VPR_REGISTRIES: '[]',
      DISABLE_DIGEST_SRI_VERIFICATION: false,
    } as any;

    const result = await pollOnce(mockIndexer, config);

    // Exactly two indexer round-trips: one for the empty block + one for the next-change block.
    expect(mockIndexer.listChanges).toHaveBeenCalledTimes(2);
    expect(mockIndexer.listChanges).toHaveBeenNthCalledWith(1, 803_600);
    expect(mockIndexer.listChanges).toHaveBeenNthCalledWith(2, 883_490);

    // After the fast-forward, lastProcessedBlock jumps to next_change_at - 1 = 883_489,
    // then is updated to 883_490 once that block is processed.
    expect(setLastProcessedBlock).toHaveBeenCalledWith(883_489);
    expect(setLastProcessedBlock).toHaveBeenLastCalledWith(883_490);

    // Verre pass runs only for the block that actually has activity.
    expect(runVerrePass).toHaveBeenCalledTimes(1);

    // 1 fast-forward + 1 real block = 2 blocksProcessed.
    expect(result.blocksProcessed).toBe(2);
    expect(result.didsAffected).toBeGreaterThanOrEqual(1);
  });

  it('clamps next_change_at to indexerHeight when the hint points past the head', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock, setLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');

    // Resolver at 100, indexer head is 200, but indexer claims next_change_at = 1_000_000
    // (e.g. nothing in [101, 200] either). We must clamp to 200, not jump to 999_999.
    vi.mocked(getLastProcessedBlock).mockResolvedValue(100);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 200 }),
      listChanges: vi.fn().mockResolvedValueOnce({
        block_height: 101,
        next_change_at: 1_000_000,
        activity: [],
      }),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      TRUST_TTL_REFRESH_RATIO: 0.2,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      VPR_REGISTRIES: '[]',
      DISABLE_DIGEST_SRI_VERIFICATION: false,
    } as any;

    const result = await pollOnce(mockIndexer, config);

    // We clamp: jump to indexerHeight (200), not to 999_999.
    expect(setLastProcessedBlock).toHaveBeenCalledWith(200);
    // After lastBlock = 200 == indexerHeight, the while-loop exits — no second listChanges call.
    expect(mockIndexer.listChanges).toHaveBeenCalledTimes(1);
    expect(result.blocksProcessed).toBe(1);
  });

  it('falls back to one-by-one processing when next_change_at is absent (legacy indexer)', async () => {
    const { pollOnce } = await import('../src/polling/polling-loop.js');
    const { getLastProcessedBlock } = await import('../src/polling/resolver-state.js');
    const { cleanupExpiredRetries } = await import('../src/polling/reattemptable.js');

    vi.mocked(getLastProcessedBlock).mockResolvedValue(99);
    vi.mocked(cleanupExpiredRetries).mockResolvedValue([]);

    // Older indexer that does not surface next_change_at — the resolver
    // walks blocks one by one as before.
    const mockIndexer = {
      getBlockHeight: vi.fn().mockResolvedValue({ height: 102 }),
      listChanges: vi.fn()
        .mockResolvedValueOnce({ block_height: 100, activity: [] })
        .mockResolvedValueOnce({ block_height: 101, activity: [] })
        .mockResolvedValueOnce({ block_height: 102, activity: [] }),
      clearMemo: vi.fn(),
    } as any;

    const config = {
      POLL_INTERVAL: 5,
      TRUST_TTL: 3600,
      TRUST_TTL_REFRESH_RATIO: 0.2,
      POLL_OBJECT_CACHING_RETRY_DAYS: 7,
      ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
      VPR_REGISTRIES: '[]',
      DISABLE_DIGEST_SRI_VERIFICATION: false,
    } as any;

    const result = await pollOnce(mockIndexer, config);

    expect(mockIndexer.listChanges).toHaveBeenCalledTimes(3);
    expect(result.blocksProcessed).toBe(3);
  });
});
