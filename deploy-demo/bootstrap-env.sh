#!/usr/bin/env bash
# Run once in the repo root on the demo server (after `git checkout master`).
# Writes .env (compose) and .env.docker (backend) with fresh random secrets.
# AES_CCCD_KEY must be the one the demo data was encrypted with: ./deploy-demo/aes_cccd.key
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || [ -f .env.docker ] && { echo "refusing to overwrite .env / .env.docker"; exit 1; }
HOST="${1:?usage: bootstrap-env.sh <public origin, e.g. http://203.0.113.10 or https://demo.example.vn>}"
r() { openssl rand -hex "${1:-32}"; }
DB_PASSWORD=$(r 16); REDIS_PASSWORD=$(r 16)
cat > .env <<ENV
REGISTRY=local
IMAGE_TAG=demo
DB_USER=mms
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=mms_db
REDIS_PASSWORD=${REDIS_PASSWORD}
ENV
cat > .env.docker <<ENV
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1/mms_core
DB_HOST=postgres
DB_PORT=5432
DB_USER=mms
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=mms_db
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=$(r 32)
JWT_REFRESH_SECRET=$(r 32)
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
AES_CCCD_KEY=$(cat deploy-demo/aes_cccd.key)
MFA_ENCRYPTION_KEY=$(r 32)
TRUST_PROXY=10.87.64.10
CORS_ORIGIN=${HOST}
ENV
chmod 600 .env .env.docker
echo "written .env and .env.docker (mode 600)"
