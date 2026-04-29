import { describe, expect, it, vi, afterEach } from 'vitest';

// Stub the resolver's logger factory so we can introspect every `warn` call
// without depending on pino's stdout transport (which is awkward to spy on
// reliably under vitest). The hoisted accessor returns the latest mock
// instance so each test can read its arguments.
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock('../src/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  }),
}));

import {
  parseVprRegistries,
  logStartupConfigCrossChecks,
} from '../src/polling/polling-loop.js';

/**
 * Concatenate every captured `logger.warn(...)` argument into a single string
 * so tests can assert on text fragments regardless of whether the message
 * arrived as `(message)` or `(meta, message)`.
 */
function flattenWarnCalls(): string {
  return warnMock.mock.calls
    .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

describe('parseVprRegistries — strict shape validation', () => {
  it('returns [] for empty / whitespace input (no allowlist scenario)', () => {
    expect(parseVprRegistries('')).toEqual([]);
    expect(parseVprRegistries('   ')).toEqual([]);
  });

  it('returns [] for an explicit empty array (test fixture compatibility)', () => {
    expect(parseVprRegistries('[]')).toEqual([]);
  });

  it('parses a well-formed array of entries unchanged', () => {
    const json = JSON.stringify([
      {
        id: 'vpr:verana:vna-testnet-1',
        baseUrls: ['https://idx.testnet.verana.network/verana'],
        production: true,
      },
      {
        id: 'vpr:verana:vna-devnet-1',
        baseUrls: ['https://idx.devnet.verana.network/verana'],
        production: false,
      },
    ]);
    const result = parseVprRegistries(json);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('vpr:verana:vna-testnet-1');
    expect(result[1].production).toBe(false);
  });

  it('throws on malformed JSON instead of silently returning []', () => {
    expect(() => parseVprRegistries('this is not json')).toThrowError(/not valid JSON/);
  });

  it('throws when the top level is not an array', () => {
    expect(() => parseVprRegistries('{"id":"vpr:verana:vna-testnet-1"}')).toThrowError(
      /Invalid VPR_REGISTRIES configuration/,
    );
  });

  it('throws when an entry id does not start with vpr:', () => {
    const json = JSON.stringify([
      { id: 'verana-testnet', baseUrls: ['https://idx.example.com'], production: true },
    ]);
    expect(() => parseVprRegistries(json)).toThrowError(/must have an id starting with 'vpr:'/);
  });

  it('throws when baseUrls is empty or missing', () => {
    const json = JSON.stringify([
      { id: 'vpr:verana:vna-testnet-1', baseUrls: [], production: true },
    ]);
    expect(() => parseVprRegistries(json)).toThrowError(/baseUrls must contain at least one URL/);
  });

  it('throws when baseUrls[0] is not a valid URL', () => {
    const json = JSON.stringify([
      { id: 'vpr:verana:vna-testnet-1', baseUrls: ['not-a-url'], production: true },
    ]);
    expect(() => parseVprRegistries(json)).toThrowError(/Invalid VPR_REGISTRIES configuration/);
  });

  it('throws when production is not a boolean', () => {
    const json = JSON.stringify([
      { id: 'vpr:verana:vna-testnet-1', baseUrls: ['https://idx.example.com'], production: 'yes' },
    ]);
    expect(() => parseVprRegistries(json)).toThrowError(/Invalid VPR_REGISTRIES configuration/);
  });

  it('accepts the optional allowedEcsEcosystems array', () => {
    const json = JSON.stringify([
      {
        id: 'vpr:verana:vna-testnet-1',
        baseUrls: ['https://idx.testnet.verana.network/verana'],
        production: true,
        allowedEcsEcosystems: ['did:web:ecosystem.example.com'],
      },
    ]);
    const result = parseVprRegistries(json);
    expect(result[0].allowedEcsEcosystems).toEqual(['did:web:ecosystem.example.com']);
  });
});

describe('logStartupConfigCrossChecks', () => {
  afterEach(() => {
    warnMock.mockClear();
  });

  const baseConfig = {
    INDEXER_API: 'https://idx.testnet.verana.network/verana',
    ECS_ECOSYSTEM_DIDS: 'did:web:ecosystem.example.com',
    VPR_REGISTRIES: '[]',
  } as Parameters<typeof logStartupConfigCrossChecks>[0];

  const matchingRegistry = {
    id: 'vpr:verana:vna-testnet-1',
    baseUrls: ['https://idx.testnet.verana.network/verana'],
    production: true,
  };

  const mismatchingRegistry = {
    id: 'vpr:verana:vna-devnet-1',
    baseUrls: ['https://idx.devnet.verana.network/verana'],
    production: false,
  };

  it('does not warn when INDEXER_API host matches a registry baseUrl host', () => {
    logStartupConfigCrossChecks(baseConfig, [matchingRegistry]);
    expect(flattenWarnCalls()).not.toContain('common testnet/devnet mismatch');
  });

  it('warns when INDEXER_API host has no matching registry baseUrl host', () => {
    logStartupConfigCrossChecks(baseConfig, [mismatchingRegistry]);
    const log = flattenWarnCalls();
    expect(log).toContain('common testnet/devnet mismatch');
    expect(log).toContain('idx.testnet.verana.network');
    expect(log).toContain('idx.devnet.verana.network');
  });

  it('does NOT warn about a host mismatch when registries is empty (no allowlist)', () => {
    // An empty allowlist legitimately means "no vpr: rewrites are expected",
    // so we skip the cross-check rather than emitting a noisy warning.
    logStartupConfigCrossChecks(baseConfig, []);
    expect(flattenWarnCalls()).not.toContain('common testnet/devnet mismatch');
  });

  it('warns when an ECS_ECOSYSTEM_DIDS entry is not a well-formed DID', () => {
    logStartupConfigCrossChecks(
      { ...baseConfig, ECS_ECOSYSTEM_DIDS: 'did:web:ok.example.com,not-a-did,did:web:also-ok.example.com' },
      [matchingRegistry],
    );
    const log = flattenWarnCalls();
    expect(log).toContain('not well-formed DIDs');
    expect(log).toContain('not-a-did');
  });

  it('does not warn when all ECS_ECOSYSTEM_DIDS entries start with did:', () => {
    logStartupConfigCrossChecks(
      { ...baseConfig, ECS_ECOSYSTEM_DIDS: 'did:web:a.example.com, did:web:b.example.com' },
      [matchingRegistry],
    );
    expect(flattenWarnCalls()).not.toContain('not well-formed DIDs');
  });
});
