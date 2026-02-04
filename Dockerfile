FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S trader -u 1001

# Create log directory
RUN mkdir -p /app/logs && chown -R trader:nodejs /app/logs

USER trader

EXPOSE 3000

CMD ["node", "dist/index.js"]
