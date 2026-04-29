import 'dotenv/config';
import Fastify from 'fastify';
import { loadConfig } from './config/index.js';
import { registerQ1Route } from './routes/q1-resolve.js';
import { createQ2Route } from './routes/q2-issuer-auth.js';
import { createQ3Route } from './routes/q3-verifier-auth.js';
import { createQ4Route } from './routes/q4-ecosystem-participant.js';
import { registerHealthRoutes } from './routes/health.js';
import { IndexerClient } from './indexer/client.js';
import { registry, queryDurationSeconds } from './observability/metrics.js';
import { getPool, closePool } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { connectRedis, disconnectRedis } from './cache/redis-client.js';
import {
  startPollingLoop,
  parseVprRegistries,
  logStartupConfigCrossChecks,
} from './polling/polling-loop.js';
import { createInjectDidRoute } from './routes/inject-did.js';
import { createQ5oute } from './routes/refresh.js';
import { registerSwagger } from './swagger.js';
import { createLogger } from './logger.js';
import { registerResolverRoutes } from './routes/version.js';

const logger = createLogger('main');

async function main(): Promise<void> {
  const config = loadConfig();

  // 0. Validate VPR_REGISTRIES JSON shape and surface common cross-config
  // misconfigurations as warnings before any DID resolution is attempted.
  // `parseVprRegistries` throws on a malformed JSON / shape error, so the
  // resolver fails fast at boot rather than at request-handling time.
  const verifiablePublicRegistries = parseVprRegistries(config.VPR_REGISTRIES);
  logStartupConfigCrossChecks(config, verifiablePublicRegistries);

  // 1. Connect to PostgreSQL and run pending migrations
  logger.info('Connecting to PostgreSQL and running migrations...');
  const pool = getPool();
  const applied = await runMigrations(pool);
  if (applied.length > 0) {
    logger.info({ migrations: applied }, 'Applied database migrations');
  }

  // 2. Connect to Redis (file cache for DID docs, VPs, VCs)
  logger.info('Connecting to Redis...');
  await connectRedis();

  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  // Request duration tracking
  server.addHook('onResponse', (request, reply, done) => {
    const url = request.routeOptions?.url ?? request.url;
    // Skip metrics/health from histogram
    if (!url.startsWith('/metrics') && !url.startsWith('/v1/health')) {
      const duration = reply.elapsedTime / 1000; // ms \u2192 seconds
      queryDurationSeconds.observe({ endpoint: url, status_code: reply.statusCode }, duration);
    }
    done();
  });

  // OpenAPI + Swagger UI
  await registerSwagger(server);

  // Health + readiness
  await registerHealthRoutes(server);

  // Resolver
  await registerResolverRoutes(server);

  // Prometheus metrics
  server.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  await registerQ1Route(server);

  // Q2+ endpoints need IndexerClient
  const indexer = new IndexerClient(config.INDEXER_API);
  await createQ2Route(verifiablePublicRegistries)(server);
  await createQ3Route(verifiablePublicRegistries)(server);
  await createQ4Route(indexer)(server);
  await createQ5oute(indexer, config)(server);

  // Dev-mode: inject DID endpoint
  if (config.INJECT_DID_ENDPOINT_ENABLED) {
    await createInjectDidRoute(indexer, config)(server);
    logger.info('Dev endpoint enabled: POST /v1/inject/did');
  }

  // 3. Start polling loop for leader instances (if polling is enabled)
  const abortController = new AbortController();
  if (config.INSTANCE_ROLE === 'leader' && config.ENABLE_POLLING) {
    startPollingLoop({
      indexer,
      config,
      signal: abortController.signal,
    }).catch((err) => {
      logger.error({ err }, 'Polling loop exited with error');
    });
  } else if (!config.ENABLE_POLLING) {
    logger.info('Polling is disabled (ENABLE_POLLING=false)');
  }

  // 4. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    abortController.abort();
    await server.close();
    await disconnectRedis();
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  server.log.info(
    `Verana Trust Resolver started (role=${config.INSTANCE_ROLE}, indexer=${config.INDEXER_API})`,
  );

  server.log.info('Health: /v1/health | Readiness: /v1/health/ready | Metrics: /metrics');
}

main().catch((err) => {
  console.error('Failed to start resolver:', err);
  process.exit(1);
});
