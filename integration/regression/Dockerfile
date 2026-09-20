FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
WORKDIR /app
COPY vendor /app/vendor
COPY integration/cell-platform /app/integration/cell-platform
RUN npm ci --ignore-scripts --prefix integration/cell-platform && npm run build --prefix integration/cell-platform
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/GuoMonth/dsh-multi-tenant" org.opencontainers.image.revision=$SOURCE_REVISION
USER node
CMD ["node", "integration/cell-platform/dist/main.js", "/private/config.json"]
