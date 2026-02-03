# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# yt-dlp 설치에 필요한 패키지
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/cache/apk/*

# yt-dlp 설치
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p /app/data

# 환경변수
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/trends.db
ENV PORT=3000
ENV TZ=Asia/Seoul

# Expose port
EXPOSE 3000

# Run
CMD ["npm", "start"]
