# Verana Trust Resolver — `mjfelis/verana-resolver` fork

> **Fork notice.** This `feat/fork-publish` branch builds a custom container image from this fork while the `feat/per-vp-outcomes` per-VP / spec-v4 changes are pending upstream review. The image is published as `ghcr.io/mjfelis/verana-resolver:feat-fork-publish` (plus per-SHA tags) by the `Fork — build & push Docker image to ghcr.io` workflow. The fork's `@verana-labs/verre` dependency is pinned to the matching [`mjfelis/verre#feat/fork-publish`](https://github.com/mjfelis/verre/tree/feat/fork-publish) branch via a git URL, so no source-level renames are needed and the upstream-PR-bound branches stay clean.

The **Verana Trust Resolver** is a core infrastructure component of the [Verana](https://verana.io) ecosystem. It continuously ingests state from the **Verana Indexer**, resolves decentralized identifiers (DIDs), dereferences verifiable credentials (VCs) presented as [linked-vp](https://identity.foundation/linked-vp/) in DID Documents, and validates trust according to the **Verifiable Trust Specification**.

## Features

- **Block-based ingestion** — polls the Verana Indexer at configurable intervals
- **Two-pass trust evaluation** — Pass1 (caching/dereferencing) + Pass2 (trust evaluation)
- **Retry subsystem** — automatic retry of transient failures with permanent error detection
- **REST API** — four trust resolution endpoints (Q1–Q4)
- **Leader election** — only one instance runs the polling loop in multi-instance deployments
- **TTL-based caching** — separate TTLs for dereferenced objects and trust evaluations

## REST API Endpoints

| Endpoint | Description |
|---|---|
| `GET /v1/trust/resolve` | Q1 — Full trust resolution for a DID |
| `GET /v1/trust/issuer-authorization` | Q2 — Check if a DID is an authorized issuer for a credential schema |
| `GET /v1/trust/verifier-authorization` | Q3 — Check if a DID is an authorized verifier for a credential schema |
| `GET /v1/trust/ecosystem-participant` | Q4 — Check if a DID holds any active permissions in an ecosystem |
| `GET /v1/trust/refresh` | Q5 — Refresh and check trust resolution for a unique DID |
| `GET /v1/health` | Health check |

## Container Environment Variables

### Required

| Variable | Description |
|---|---|
| `POSTGRES_HOST` | PostgreSQL host address |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | PostgreSQL database name |
| `REDIS_URL` | Redis connection string (e.g. `redis://host:6379`) |
| `INDEXER_API` | URL of the Verana Indexer API (e.g. `http://indexer:1317`) |
| `ECS_ECOSYSTEM_DIDS` | Comma-separated list of allowed ECS ecosystem DIDs |

### Optional

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `PORT` | `3000` | HTTP listen port |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `INSTANCE_ROLE` | `leader` | Instance role: `leader` (runs polling loop) or `reader` (API-only) |
| `POLL_INTERVAL` | `5` | Seconds between polling cycles |
| `CACHE_TTL` | `86400` | Dereferenced object cache TTL in seconds (24h) |
| `TRUST_TTL` | `3600` | Trust evaluation result TTL in seconds (1h) |
| `POLL_OBJECT_CACHING_RETRY_DAYS` | `7` | Maximum retry window for failed dereferencing (days) |
| `DISABLE_DIGEST_SRI_VERIFICATION` | `false` | When `true`, skip digestSRI verification of JSON schema content and log that it was omitted |
| `ECS_DIGEST_SERVICE` | *(spec v4)* | SHA-384 JCS digest of the ServiceCredential JSON schema (spec [ECS-TR]) |
| `ECS_DIGEST_ORG` | *(spec v4)* | SHA-384 JCS digest of the OrganizationCredential JSON schema (spec [ECS-TR]) |
| `ECS_DIGEST_PERSONA` | *(spec v4)* | SHA-384 JCS digest of the PersonaCredential JSON schema (spec [ECS-TR]) |
| `ECS_DIGEST_UA` | *(spec v4)* | SHA-384 JCS digest of the UserAgentCredential JSON schema (spec [ECS-TR]) |
| `VPR_REGISTRIES` | `[{"id":"vpr:verana:vna-testnet-1","baseUrls":["https://idx.testnet.verana.network/verana"],"production":true},{"id":"vpr:verana:vna-devnet-1","baseUrls":["https://idx.devnet.verana.network/verana"],"production":true}]` | Verifiable Public Registries (JSON array) |

## Tech Stack

- **Runtime**: Node.js 22
- **Language**: TypeScript
- **Web framework**: Fastify
- **SSI**: Direct crypto (Ed25519, JWT via jose), DIF DID resolvers (did:web, did:webvh)
- **Database**: PostgreSQL
- **Cache**: Redis
- **Testing**: Vitest

## Development

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Run tests
npm test

# Start in dev mode (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## License

See [LICENSE](LICENSE).
