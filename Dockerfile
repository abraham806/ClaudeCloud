# Image unique : l'API sert aussi l'application web compilée.
FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000 DB_FILE=/data/facturo.db UPLOAD_DIR=/data/uploads WEB_DIST=/app/web/dist
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /app/web/dist /app/web/dist
VOLUME /data
EXPOSE 4000
CMD ["node", "src/index.js"]
