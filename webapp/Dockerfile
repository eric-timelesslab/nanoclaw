FROM node:24-slim

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy webapp source and public assets
COPY webapp/ ./webapp/
COPY tsconfig.json ./

# Install tsx for running TypeScript directly
RUN npm install -g tsx

EXPOSE 4000

CMD ["tsx", "webapp/server.ts"]
