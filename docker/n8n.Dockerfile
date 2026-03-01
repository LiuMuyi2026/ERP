FROM n8nio/n8n:latest

USER root
RUN mkdir -p /home/node/.n8n/custom

COPY dist/ /home/node/.n8n/custom/

RUN chown -R node:node /home/node/.n8n/custom/ || true

USER node

EXPOSE 5678
