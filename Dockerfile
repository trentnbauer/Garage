# Garage: web app built with Vite, served with its API by a small Node server.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
ARG VERSION=dev
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data STATIC_DIR=/app/web/dist GARAGE_VERSION=$VERSION
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=web /app/web/dist ./web/dist
# cloudflared for the Cloudflare tunnel (Admin settings). It's a static binary; the image picks the right architecture.
# shortcut: follows cloudflared's latest release, pin a tag here if a release ever breaks the tunnel.
COPY --from=cloudflare/cloudflared:latest /usr/local/bin/cloudflared /usr/local/bin/cloudflared
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/state >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
