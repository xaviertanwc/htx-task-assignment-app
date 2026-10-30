FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Scripts are skipped: compiling only needs tsc, and test-only binaries are not used here.
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY migrations ./migrations
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
