FROM docker.io/library/node:20-slim

ARG SANDBOX_NAME="plantir-cli-sandbox"
ARG CLI_VERSION_ARG
ENV SANDBOX="$SANDBOX_NAME"
ENV CLI_VERSION=$CLI_VERSION_ARG

# install minimal set of packages, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  man-db \
  curl \
  dnsutils \
  less \
  jq \
  bc \
  gh \
  git \
  unzip \
  rsync \
  ripgrep \
  procps \
  psmisc \
  lsof \
  socat \
  ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

  # Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Set Bun's path for global access (optional, depends on Bun's installation)

# set up npm global package folder under /usr/local/share
# give it to non-root user node, already set up in base image
RUN mkdir -p /usr/local/share/npm-global \
  && mkdir -p /usr/local/share/npm-global/lib \
  && mkdir -p /usr/local/temp \
  && chown -R node:node /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH="/root/.bun/bin:$PATH"

# switch to non-root user node

# install gemini-cli and clean up
COPY packages/opencode/opencode-*.tgz /usr/local/share/npm-global/plantir-cli.tgz
RUN cd /usr/local/temp \
  && bun install -g opencode-linux-arm64 /usr/local/share/npm-global/plantir-cli.tgz \
  && rm -f /usr/local/share/npm-global/plantir-cli.tgz

  # --registry=https://registry.npmjs.org
# default entrypoint when none specified
CMD ["opencode"]