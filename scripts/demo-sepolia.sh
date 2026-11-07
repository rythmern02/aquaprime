#!/usr/bin/env bash
# Runs the app exactly as the hosted (Vercel) judge demo does: Sepolia, labelled demo market, hosted test IdP.
# Reads secrets from the gitignored root .env. Usage: npm run demo:sepolia  [PORT=3005]
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
PORT=${PORT:-3005}
ORIGIN=${PUBLIC_ORIGIN:-http://localhost:$PORT}
cd frontend
export NEXT_DIST_DIR=.next-hosted NEXT_PUBLIC_CHAIN_ID=11155111 NEXT_PUBLIC_MARKET=demo \
  NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  ORACLE_OPERATOR_PRIVATE_KEY="$KEEPER_PRIVATE_KEY" ENABLE_OPERATOR_ORACLE=true KEEPER_API_TOKEN="${KEEPER_API_TOKEN:-$TEST_IDP_CLIENT_SECRET}" \
  TEST_IDP_ENABLED=true WORLD_AUTH_ISSUER="$ORIGIN/api/test-idp" WORLD_AUTH_CLIENT_ID=aquaprime-demo \
  WORLD_AUTH_CLIENT_SECRET="$TEST_IDP_CLIENT_SECRET" WORLD_AUTH_REDIRECT_URI="$ORIGIN/api/agentpass/callback"
exec npx next ${NEXT_CMD:-dev} -p "$PORT"
