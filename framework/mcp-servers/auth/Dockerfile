FROM oven/bun:1.1-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bun -u 1001

# Change ownership of the app directory
RUN chown -R bun:nodejs /app
USER bun

EXPOSE 3004

CMD ["bun", "index.ts"]