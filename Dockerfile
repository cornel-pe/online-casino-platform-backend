# Backend Dockerfile for SpinX Casino Platform

# Use Node.js 20 LTS as base image
FROM node:20-alpine AS base

# Install build dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Dependencies stage
FROM base AS deps

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Builder stage
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM base AS runner

WORKDIR /app

# Set to production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 spinx

# Copy necessary files from builder
COPY --from=builder --chown=spinx:nodejs /app/build ./build
COPY --from=builder --chown=spinx:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=spinx:nodejs /app/package*.json ./

# Create logs directory
RUN mkdir -p logs && chown -R spinx:nodejs logs

# Switch to non-root user
USER spinx

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "build/server.js"]

