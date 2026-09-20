FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
WORKDIR /app
COPY dsh-multi-tenant-*.tgz /tmp/platform.tgz
RUN npm install --ignore-scripts --no-audit --no-fund /tmp/platform.tgz && rm /tmp/platform.tgz
USER node
ENTRYPOINT ["node", "/app/node_modules/dsh-multi-tenant/dist/cli.mjs"]
CMD ["start", "--config", "/private/config.json"]
