# Build-only image for the OSS-Fuzz-style scanner: installs every dependency and
# builds the root Next.js app so an offline agent can audit the compiled code.
# It does not run the app, so no secrets are needed at build time.
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0

WORKDIR /src

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
