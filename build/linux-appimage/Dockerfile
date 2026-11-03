FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV npm_config_loglevel=warn
ENV ELECTRON_CACHE=/tmp/electron-cache
ENV ELECTRON_BUILDER_CACHE=/tmp/electron-builder-cache

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    python3 \
    make \
    g++ \
    rsync \
    file \
    desktop-file-utils \
    xz-utils \
    squashfs-tools \
    fakeroot \
    libfuse2 \
    libarchive-tools \
    rpm \
    zsync \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

CMD ["/bin/bash", "-lc", "echo Use scripts/build-linux-appimage-podman.ps1 to run this image"]