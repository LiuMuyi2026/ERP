FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

RUN mkdir -p /app/data/wa-sessions

EXPOSE 3100

CMD ["node", "dist/index.js"]
