FROM node:20-alpine AS frontend-build
WORKDIR /app/hash-tag-routing-app
COPY hash-tag-routing-app/package*.json ./
RUN npm ci
COPY hash-tag-routing-app/ ./
RUN npm run build

FROM node:20-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8083

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=frontend-build /app/hash-tag-routing-app/dist ./hash-tag-routing-app/dist

EXPOSE 8083
CMD ["node", "server/server.js"]
