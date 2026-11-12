# Imagem única: compila o front e roda a API, que também entrega o front compilado.

# --- 1. compila o front ---
FROM node:24-alpine AS web
WORKDIR /build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- 2. API + front compilado ---
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY server/migrations ./migrations
COPY --from=web /build/dist /app/dist
# Comprovantes de pagamento ficam em um volume, fora da imagem.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]
