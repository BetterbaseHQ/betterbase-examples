# Unified examples image: all example apps as static builds under one origin,
# served path-based (launchpad at /, other apps at /<app>/).
#
# Build context is the REPOSITORY ROOT that contains this repo as a sibling
# checkout (betterbase-dev root, or a CI workspace with betterbase-examples/,
# betterbase/, json-joy-rs/ side by side):
#
#   docker build -f betterbase-examples/Dockerfile .
#
# Requires the SDK's wasm-pack output on disk (betterbase/js builds it from
# source with `pnpm build:wasm`; the pkg/ dirs are gitignored).

# ==========================================================================
# Build stage — compile every app with its deployment base path
# ==========================================================================
# The build output is platform-independent static files, so build under the
# native platform even for foreign-arch image builds (no QEMU here).
FROM --platform=$BUILDPLATFORM node:24.21-alpine AS build

RUN corepack enable

WORKDIR /workspace

# SDK (TypeScript source + pre-built WASM bindings); Vite resolves the TS
# source directly, so no SDK build step is needed.
COPY betterbase/js/ ./betterbase/js/
COPY betterbase/crates/betterbase-wasm/pkg/ ./betterbase/crates/betterbase-wasm/pkg/
COPY betterbase/crates/betterbase-db-wasm/pkg/ ./betterbase/crates/betterbase-db-wasm/pkg/
RUN cd betterbase/js && pnpm install --frozen-lockfile

# Shared package (apps depend on its built dist)
COPY betterbase-examples/shared/ ./examples/shared/
RUN cd examples/shared && pnpm install --frozen-lockfile && pnpm build

# Launchpad is the index page — mounted at /, so it keeps the default base.
COPY betterbase-examples/launchpad/ ./examples/launchpad/
RUN cd examples/launchpad && pnpm install --frozen-lockfile && pnpm build

# Every other app is mounted at /<app>/.
COPY betterbase-examples/tasks/ ./examples/tasks/
RUN cd examples/tasks && pnpm install --frozen-lockfile && VITE_BASE_PATH=/tasks/ pnpm build

COPY betterbase-examples/notes/ ./examples/notes/
RUN cd examples/notes && pnpm install --frozen-lockfile && VITE_BASE_PATH=/notes/ pnpm build

COPY betterbase-examples/photos/ ./examples/photos/
RUN cd examples/photos && pnpm install --frozen-lockfile && VITE_BASE_PATH=/photos/ pnpm build

COPY betterbase-examples/board/ ./examples/board/
RUN cd examples/board && pnpm install --frozen-lockfile && VITE_BASE_PATH=/board/ pnpm build

COPY betterbase-examples/chat/ ./examples/chat/
RUN cd examples/chat && pnpm install --frozen-lockfile && VITE_BASE_PATH=/chat/ pnpm build

COPY betterbase-examples/passwords/ ./examples/passwords/
RUN cd examples/passwords && pnpm install --frozen-lockfile && VITE_BASE_PATH=/passwords/ pnpm build

# ==========================================================================
# Serve stage — static file server with runtime config injection
# ==========================================================================
FROM caddy:2-alpine

# Launchpad at the root, each app under its path.
COPY --from=build /workspace/examples/launchpad/dist /srv
COPY --from=build /workspace/examples/tasks/dist /srv/tasks
COPY --from=build /workspace/examples/notes/dist /srv/notes
COPY --from=build /workspace/examples/photos/dist /srv/photos
COPY --from=build /workspace/examples/board/dist /srv/board
COPY --from=build /workspace/examples/chat/dist /srv/chat
COPY --from=build /workspace/examples/passwords/dist /srv/passwords

COPY betterbase-examples/docker/Caddyfile /etc/caddy/Caddyfile
COPY betterbase-examples/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
