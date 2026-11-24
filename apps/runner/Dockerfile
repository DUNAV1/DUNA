# DUNA's disposable local runner. Build explicitly; never pulled or replaced at runtime.
FROM node:22-alpine

RUN addgroup -S -g 10001 duna \
  && adduser -S -D -H -u 10001 -G duna duna \
  && mkdir -p /opt/duna-runner /workspace \
  && chown -R 10001:10001 /opt/duna-runner /workspace

WORKDIR /opt/duna-runner
RUN npm install --prefix /opt/duna-runner --ignore-scripts --no-audit --no-fund typescript@5.7.3

COPY --chown=10001:10001 idle.mjs /opt/duna-runner/idle.mjs
COPY --chown=10001:10001 runner-entrypoint.mjs /opt/duna-runner/runner-entrypoint.mjs
COPY --chown=10001:10001 check-javascript.mjs /opt/duna-runner/check-javascript.mjs
COPY --chown=10001:10001 check-typescript.mjs /opt/duna-runner/check-typescript.mjs

USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/duna-runner/idle.mjs"]
