FROM node:20-alpine AS builder

WORKDIR /app

# Accept build-time API URL for NEXT_PUBLIC_* env vars
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN mkdir -p public
RUN npm run build

# Production image — standalone output (~50MB vs ~500MB)
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone server + static assets + public files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["sh", "-c", "echo \"[frontend] starting standalone server on 0.0.0.0:${PORT:-3000}\"; HOSTNAME=0.0.0.0 node server.js"]
