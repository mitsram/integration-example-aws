FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

EXPOSE 5000
CMD ["node", "dist/app.js"]
