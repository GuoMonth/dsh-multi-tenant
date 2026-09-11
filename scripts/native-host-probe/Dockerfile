FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
WORKDIR /opt/probe
COPY package.json ./
COPY node_modules ./node_modules
COPY launch.mjs model.mjs mcp.mjs profile.patch.yml /fixtures/
ENV DSH_HOME=/domain/dsh-home
USER 1000:1000
CMD ["node", "/fixtures/launch.mjs"]
