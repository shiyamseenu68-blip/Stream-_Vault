FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install yt-dlp and ffmpeg for video downloads
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3-pip ffmpeg && \
    pip3 install --break-system-packages yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ ./lib/
COPY artifacts/ ./artifacts/
COPY scripts/ ./scripts/
COPY tsconfig.json tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @workspace/api-zod build 2>/dev/null || true
RUN pnpm --filter @workspace/api-server run build

EXPOSE 10000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
