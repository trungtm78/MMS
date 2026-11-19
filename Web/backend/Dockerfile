FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# The image carries compiled JavaScript only: no source maps, no type declarations
RUN find dist -type f \( -name '*.map' -o -name '*.d.ts' \) -delete
# SQL migrations own the schema; pending ones are applied before the server starts.
# Replicas starting together are serialised by the migrator's advisory lock, but releases
# with incompatible schema changes are still deployed drained, one migrating instance and
# no mixed versions. A database migrated before migration history existed is refused
# until MIGRATION_BASELINE_THROUGH names the last file it has. See docs/migrations.md.
COPY migrations ./migrations
EXPOSE 3000
# Set RUN_MIGRATIONS=false when a separate release step migrates the database
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then node dist/database/migrations/migrate.cli.js || exit 1; fi; exec node dist/main"]
