FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY dist/ ./dist/

RUN mkdir -p /app/data/wa-sessions

EXPOSE 3100

CMD ["node", "dist/index.js"]
