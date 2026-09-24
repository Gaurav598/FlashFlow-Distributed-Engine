FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

EXPOSE 3000

USER node
CMD ["node", "src/index.js"]
