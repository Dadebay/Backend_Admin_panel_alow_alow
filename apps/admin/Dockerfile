# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG NPM_VERSION=11.6.2

FROM ${NODE_IMAGE} AS dependencies
ARG NPM_VERSION
WORKDIR /workspace
ENV CI=true
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install --global "npm@${NPM_VERSION}" --no-audit --no-fund

COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY packages/api-contract/src ./packages/api-contract/src
COPY apps/admin/package.json apps/admin/package-lock.json ./apps/admin/
RUN --mount=type=cache,target=/root/.npm \
  npm ci --prefix apps/admin --no-audit --no-fund

FROM dependencies AS build
COPY apps/admin ./apps/admin
RUN npm --prefix apps/admin run build:node

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=build --chown=node:node /workspace/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=node:node /workspace/apps/admin/public ./apps/admin/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]
CMD ["node", "apps/admin/server.js"]
