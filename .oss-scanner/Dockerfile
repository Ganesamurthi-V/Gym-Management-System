# This file sets up the environment, installs the project's dependencies and builds the GymFlow root Next.js app.
# The scanner builds it with the repository as the build context, so `COPY . /src` puts the checkout inside the image.
# Network access is available during this build and is removed afterwards, so everything an agent needs must be
# fetched here. The build does not start the app: it needs live Supabase and Upstash services, which the scanner lacks.
FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 \
    && rm -rf /var/lib/apt/lists/*

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src

# Install exactly the locked dependency versions, then build the app as its maintainers build it.
# A failed install or build fails the image, and primary_contact gets the log.
RUN npm ci
RUN npm run build

# Run the unit tests so you know the image works, but do not let a failing test abort the build.
# They are Vitest suites under __tests__/ and need no live services.
RUN (npm test || echo "WARNING: npm test reported failures")
