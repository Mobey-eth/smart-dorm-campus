FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir /data && chown node:node /data
COPY server ./server
COPY dist ./dist
USER node
EXPOSE 3015
CMD ["node", "server/index.js"]
