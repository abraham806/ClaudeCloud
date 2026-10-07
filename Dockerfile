# Image unique : l'API sert aussi l'application web compilée.
# Sans DATABASE_URL, la base PGlite est enregistrée dans /data.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=4000 PGLITE_DIR=/data/pglite UPLOAD_DIR=/data/uploads
VOLUME /data
EXPOSE 4000
CMD ["node", "server/src/index.js"]
