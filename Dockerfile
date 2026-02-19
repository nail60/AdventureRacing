# Build stage
FROM node:18-bookworm AS build

# Install build deps for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

# Copy source
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Vite embeds this in the client bundle at build time
ARG VITE_CESIUM_ION_TOKEN
ENV VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN

# Build all workspaces (shared → server → client)
RUN npm run build

# Remove dev dependencies to slim down node_modules
RUN npm prune --omit=dev

# Production stage
FROM node:18-bookworm-slim

WORKDIR /app

# Copy pruned node_modules and workspace structure
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/types ./shared/types

# Copy compiled server
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist

# Copy built client
COPY --from=build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

WORKDIR /app/server
CMD ["node", "dist/server/src/index.js"]
