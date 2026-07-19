# syntax=docker/dockerfile:1
# InstaCafe backend — Node ESM + Express, listens on :4469, API at /api/v1.
# node:20-slim (glibc) is used so the native `bcrypt` binary installs from a
# prebuilt rather than compiling under musl.

FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# tini = correct PID 1 so SIGTERM reaches Node (graceful shutdown in index.js).
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini wget \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN useradd --create-home --shell /bin/false app && chown -R app:app /app
USER app
EXPOSE 4469
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4469/health >/dev/null 2>&1 || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "index.js"]
