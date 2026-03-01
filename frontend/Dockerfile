FROM node:20-alpine AS builder

WORKDIR /app

# Accept build-time API URL for NEXT_PUBLIC_* env vars
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN mkdir -p public
RUN npm run build

# Production image — standalone output (~50MB vs ~500MB)
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# Copy standalone server + static assets + public files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
