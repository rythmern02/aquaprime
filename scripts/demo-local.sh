#!/usr/bin/env bash
# One-command local demo: hardhat chain + AquaPrime deploy/seed + demo borrower + Agent Pass test IdP + web app.
# Agent Pass approvals here come from a LOCAL TEST IdP (the UI labels it "NOT World"); set WORLD_AUTH_* in
# frontend/.env.local to use auth.world.org instead. Ctrl+C stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=$(mktemp -d)
cleanup() { kill $(jobs -p) 2>/dev/null || true; }
trap cleanup EXIT

wait_rpc() { for _ in $(seq 1 60); do curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' http://127.0.0.1:8545 >/dev/null && return; sleep 1; done; exit 1; }

rm -rf deployments/localhost
npx hardhat node >"$LOG/node.log" 2>&1 &
wait_rpc
npm run deploy:localhost >"$LOG/deploy.log" 2>&1
npm run seed:localhost | grep SLAC
BORROWER_INDEX=2 COLLATERAL=10 DEBT=15000 npx hardhat run scripts/demo-borrower.ts --network localhost 2>/dev/null | grep borrower

node scripts/e2e-agentpass.mjs idp >"$LOG/idp.log" 2>&1 &

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # hardhat test account #0 (public)
cd frontend
export NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 RPC_URL=http://127.0.0.1:8545 \
  ATTESTER_PRIVATE_KEY=$K0 KEEPER_PRIVATE_KEY=$K0 ORACLE_OPERATOR_PRIVATE_KEY=$K0 KEEPER_API_TOKEN=local-dev-token \
  ENABLE_OPERATOR_ORACLE=true ENABLE_DEV_TIME_TRAVEL=true \
  WORLD_AUTH_ISSUER=${WORLD_AUTH_ISSUER:-http://127.0.0.1:4455} WORLD_AUTH_CLIENT_ID=${WORLD_AUTH_CLIENT_ID:-test-client} \
  WORLD_AUTH_CLIENT_SECRET=${WORLD_AUTH_CLIENT_SECRET:-test-secret} WORLD_AUTH_REDIRECT_URI=http://localhost:3000/api/agentpass/callback
npx next build >"$LOG/build.log" 2>&1
echo "AquaPrime demo → http://localhost:3000   (borrower 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, logs in $LOG)"
npx next start -p 3000
