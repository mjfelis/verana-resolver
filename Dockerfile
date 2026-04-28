# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps
WORKDIR /app

# Build prerequisites:
#   - git: required to clone the @verana-labs/verre fork (the dep is
#     pinned to a github:mjfelis/verre#feat/fork-publish git URL).
#   - python3 / make / g++: required by verre's transitive Credo / Askar
#     devDependencies (ref-napi, cpu-features) which run node-gyp during
#     postinstall on Alpine.
RUN apk add --no-cache git python3 make g++

# Copy package files
COPY package.json ./

# Install all dependencies (including devDependencies for build)
RUN --mount=type=cache,target=/root/.npm \
    npm install

# ============================================
# Stage 2: Build the application
# ============================================
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript → dist/
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 3: Production runner (minimal image)
# ============================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs resolver

# Copy package files and install production-only dependencies.
# Same git/python3/make/g++ rationale as the deps stage — the
# @verana-labs/verre prod dep is a git URL whose own postinstall +
# prepare scripts need a build toolchain. Tools are removed in the
# same RUN to keep the runner image slim.
COPY --from=builder /app/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    apk add --no-cache --virtual .build-deps git python3 make g++ \
    && npm install --omit=dev \
    && apk del .build-deps

# Copy built application
COPY --from=builder --chown=resolver:nodejs /app/dist ./dist

# Copy database migrations
COPY --from=builder --chown=resolver:nodejs /app/migrations ./migrations

# Copy entrypoint script
COPY --chown=resolver:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy default config directory (VPR allowlist)
COPY --from=builder --chown=resolver:nodejs /app/config ./config

USER resolver

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Limit Node.js memory to prevent OOM kills in constrained environments
ENV NODE_OPTIONS="--max-old-space-size=512"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
