# Debian rather than Alpine: the embedded Postgres binaries need glibc.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
ENV DB_EMBEDDED_DATA_DIR=/app/data/postgres
WORKDIR /app
COPY package.json package-lock.json ./
# Install scripts must run: embedded-postgres uses one to link its native libraries.
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY --from=build /app/dist ./dist
# Postgres refuses to run as root, and a named volume inherits this directory's owner.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
