# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY ui/package*.json ./ui/

RUN npm ci

COPY . .

RUN npm run build

# Runtime stage
FROM node:24-alpine

WORKDIR /app

# Install Docker CLI and compose plugin so the sidecar can run compose commands.
RUN apk add --no-cache docker-cli docker-cli-compose

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/assets ./assets

EXPOSE 3003

CMD ["node", "dist/index.js"]
