# Build context: packages/multi-tenant (or the installed npm package directory).
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl wget git openssh-client jq ripgrep \
    coreutils findutils grep sed gawk diffutils patch less file \
    tar gzip bzip2 xz-utils unzip zip procps \
    python3 python3-venv python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/dsh
COPY runtime/package.json runtime/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src/native/runtime-control.mjs ./runtime-control.mjs
ENV HOME=/domain DSH_HOME=/domain/dsh-home DSH_CONTROL_DIR=/control \
    PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /domain
USER 1000:1000
CMD ["node", "--expose-internals", "/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js", "--profile", "web", "--patch", "/profile/runtime.patch.json", "--host", "127.0.0.1", "--port", "3081", "--no-open"]
