FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530
WORKDIR /app
COPY dsh-multi-tenant-*.tgz /tmp/platform.tgz
RUN npm install --engine-strict --ignore-scripts --no-audit --no-fund /tmp/platform.tgz && rm /tmp/platform.tgz
USER 1000:1000
ENTRYPOINT ["node", "/app/node_modules/dsh-multi-tenant/dist/cli.mjs"]
CMD ["start", "--config", "/private/config.json"]
