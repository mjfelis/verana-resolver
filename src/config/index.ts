import { z } from 'zod';

const InstanceRole = z.enum(['leader', 'reader']);
const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((val) => (typeof val === 'string' ? val === 'true' || val === '1' : val));

const envSchema = z.object({
  // spec.md §5.2 — Container Variables
  POLL_INTERVAL: z.coerce.number().int().positive().default(5),
  CACHE_TTL: z.coerce.number().int().positive().default(86400),
  TRUST_TTL: z.coerce.number().int().positive().default(3600),
  TRUST_TTL_REFRESH_RATIO: z.coerce.number().min(0).max(1).default(0.2),
  POLL_OBJECT_CACHING_RETRY_DAYS: z.coerce.number().int().positive().default(7),

  // PostgreSQL
  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),

  // Infrastructure
  REDIS_URL: z.string().url(),
  INSTANCE_ROLE: InstanceRole.default('leader'),

  // Indexer
  INDEXER_API: z.string().url(),
  ECS_ECOSYSTEM_DIDS: z.string().min(1),

  // Polling
  ENABLE_POLLING: booleanFromEnv.default(true),

  // Dev mode
  INJECT_DID_ENDPOINT_ENABLED: booleanFromEnv.default(false),

  // Verification
  DISABLE_DIGEST_SRI_VERIFICATION: booleanFromEnv.default(false),

  // Verre — Verifiable Public Registries (JSON array)
  // Each entry: { "id": "vpr:verana:vna-testnet-1", "baseUrls": ["https://idx.example.com/vpr"], "production": true }
  VPR_REGISTRIES: z.string().default('[{"id":"vpr:verana:vna-testnet-1","baseUrls":["https://idx.testnet.verana.network/verana"],"production":true},{"id":"vpr:verana:vna-devnet-1","baseUrls":["https://idx.devnet.verana.network/verana"],"production":true}]'),

  // ECS schema digests (spec [ECS-TR] reference values)
  ECS_DIGEST_SERVICE: z.string().default('sha384-PVseqJJjEGMVRcht77rE2yLqRnCiLBRLOklSuAshSEXK3eyITmUpDBhpQryJ/XIx'),
  ECS_DIGEST_ORG: z.string().default('sha384-XF10SsOaav+i+hBaXP29coZWZeaCZocFvfP9ZeHh9B7++q7YGA2QLTbFZqtYs/zA'),
  ECS_DIGEST_PERSONA: z.string().default('sha384-4vkQl6Ro6fudr+g5LL2NQJWVxaSTaYkyf0yVPVUmzA2leNNn0sJIsM07NlOAG/2I'),
  ECS_DIGEST_UA: z.string().default('sha384-yLRK2mCokVjRlGX0nVzdEYQ1o6YWpQqgdg6+HlSxCePP+D7wvs0+70TJACLZfbF/'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: LogLevel.default('info'),

  // Per-DID deadline applied inside `runVerrePass`. The default is
  // intentionally larger than verre's 15s HTTP fetch timeout so a DID
  // that chains a few sequential fetches (DID log + multiple VPs +
  // VCs + permission checks) can still complete before the resolver
  // gives up. Set to 0 to disable the per-DID deadline entirely.
  VERRE_PER_DID_TIMEOUT_MS: z.coerce.number().int().min(0).default(60_000),

  // Emit a `Verre pass progress` info log every N completed DIDs.
  // Set to 0 to suppress progress logs entirely. The pass-start and
  // pass-complete logs are emitted regardless.
  VERRE_PASS_PROGRESS_LOG_EVERY: z.coerce.number().int().min(0).default(10),

});

export type EnvConfig = z.infer<typeof envSchema>;
export type InstanceRoleType = z.infer<typeof InstanceRole>;

let _config: EnvConfig | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }
  _config = result.data;
  return _config;
}

export function getConfig(): EnvConfig {
  if (_config === null) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return _config;
}
