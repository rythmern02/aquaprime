# AquaPrime web + keeper API (Next.js standalone)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time
ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ARG NEXT_PUBLIC_ANON_SPECIFIER_ADDRESS=0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A
ARG NEXT_PUBLIC_ANON_BOOTSTRAP_RPC=https://ethereum-sepolia-rpc.publicnode.com
ARG NEXT_PUBLIC_ANON_WORKER_CONFIG=
ARG NEXT_PUBLIC_WORLD_APP_ID=
ARG NEXT_PUBLIC_WORLD_ACTION=aquaprime-human-prime-tier
ARG NEXT_PUBLIC_WORLD_ENVIRONMENT=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app && mkdir -p .data && chown app:app .data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
