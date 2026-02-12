# =============================================================================
# Tauri v2 build environment on Ubuntu 20.04 (Focal Fossa)
#
# Why: Tauri v2 requires libwebkit2gtk-4.1 which depends on libsoup3.
#       Ubuntu 20.04 only ships webkit2gtk-4.0 + libsoup2.4.
#       This image builds libsoup3 + WebKitGTK 2.36 from source so the
#       resulting Tauri binaries link against glibc 2.31 (focal's glibc),
#       making them compatible with Ubuntu 20.04+.
#
# Build:  docker build -t ghcr.io/<owner>/aireader-focal-build:latest .
# Push:   docker push ghcr.io/<owner>/aireader-focal-build:latest
#
# NOTE: WebKitGTK compilation is VERY heavy (~30-60 min, ~8 GB RAM).
#       Build this image on a machine with ≥16 GB RAM and ≥4 cores.
#       Once built, push to registry and reuse in CI.
# =============================================================================

FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# ---------------------------------------------------------------------------
# 1. System packages available in focal repos
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Essential build tools
    build-essential cmake ninja-build pkg-config git curl wget ca-certificates \
    python3 python3-pip \
    # Tauri / GTK runtime & dev deps
    libgtk-3-dev libgdk-pixbuf2.0-dev libglib2.0-dev \
    libappindicator3-dev librsvg2-dev patchelf \
    libffi-dev libpcre2-dev libmount-dev gettext \
    # WebKitGTK build deps (available in focal)
    libicu-dev libxml2-dev libxslt1-dev libsqlite3-dev \
    libgcrypt20-dev libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
    libnghttp2-dev \
    libpsl-dev \
    libenchant-dev libsecret-1-dev libnotify-dev libhyphen-dev \
    libopenjp2-7-dev libwoff-dev libtasn1-6-dev \
    libxt-dev libx11-dev libxcomposite-dev libxdamage-dev \
    libwayland-dev libwayland-client0 libwayland-server0 \
    libegl1-mesa-dev libgl1-mesa-dev libgles2-mesa-dev \
    libatk1.0-dev libatk-bridge2.0-dev libepoxy-dev \
    libharfbuzz-dev libcairo2-dev libpango1.0-dev \
    libjpeg-dev libpng-dev libwebp-dev libxslt1-dev \
    gobject-introspection libgirepository1.0-dev \
    ruby-dev libmanette-0.2-dev libwpe-1.0-dev libwpebackend-fdo-1.0-dev \
    unifdef gperf \
    # Needed for Node.js install
    gnupg lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip & install meson (focal's meson is too old for libsoup3)
RUN pip3 install --upgrade pip && pip3 install meson

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 2. Build GLib (>=2.69 required by libsoup3)
# ---------------------------------------------------------------------------
ARG GLIB_VERSION=2.72.4
RUN cd /tmp && \
    wget -q https://download.gnome.org/sources/glib/${GLIB_VERSION%.*}/glib-${GLIB_VERSION}.tar.xz && \
    tar xf glib-${GLIB_VERSION}.tar.xz && \
    cd glib-${GLIB_VERSION} && \
    meson setup _build \
        --prefix=/usr \
        --buildtype=release \
        -Dtests=false \
        -Dman=false \
        -Dselinux=disabled \
        -Dsystemtap=false \
        -Dxattr=false \
        -Dlibmount=enabled && \
    ninja -C _build -j$(nproc) && \
    ninja -C _build install && \
    ldconfig && \
    rm -rf /tmp/glib-*

# ---------------------------------------------------------------------------
# 3. Build libsoup 3.0.8 from source
#    (focal only has libsoup 2.4; WebKitGTK 4.1 API requires libsoup3)
# ---------------------------------------------------------------------------
ARG LIBSOUP_VERSION=3.0.8
RUN cd /tmp && \
    wget -q https://download.gnome.org/sources/libsoup/3.0/libsoup-${LIBSOUP_VERSION}.tar.xz && \
    tar xf libsoup-${LIBSOUP_VERSION}.tar.xz && \
    cd libsoup-${LIBSOUP_VERSION} && \
    meson setup _build \
        --prefix=/usr \
        --buildtype=release \
        -Dtests=false \
        -Dsysprof=disabled \
        -Dintrospection=disabled \
        -Dvapi=disabled \
        -Dntlm=disabled \
        -Dbrotli=disabled \
        -Dgssapi=disabled && \
    ninja -C _build -j$(nproc) && \
    ninja -C _build install && \
    ldconfig && \
    rm -rf /tmp/libsoup-*

# ---------------------------------------------------------------------------
# 4. Build WebKitGTK 2.36.8 from source (minimal, GTK port, 4.1 API only)
#    2.36 is the first version with the webkit2gtk-4.1 pkg-config name.
#    We disable as much as possible to speed up compilation.
# ---------------------------------------------------------------------------
ARG WEBKIT_VERSION=2.36.8
RUN cd /tmp && \
    wget -q https://webkitgtk.org/releases/webkitgtk-${WEBKIT_VERSION}.tar.xz && \
    tar xf webkitgtk-${WEBKIT_VERSION}.tar.xz && \
    cd webkitgtk-${WEBKIT_VERSION} && \
    cmake -B _build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DPORT=GTK \
        -DUSE_SOUP2=OFF \
        -DENABLE_BUBBLEWRAP_SANDBOX=OFF \
        -DENABLE_DOCUMENTATION=OFF \
        -DENABLE_MINIBROWSER=OFF \
        -DENABLE_GAMEPAD=OFF \
        -DENABLE_SPELLCHECK=OFF \
        -DENABLE_INTROSPECTION=OFF \
        -DUSE_SYSTEMD=OFF \
        -DUSE_GTK4=OFF \
        -DENABLE_GEOLOCATION=OFF \
        -DENABLE_WEB_AUDIO=OFF \
        -DUSE_SYSTEM_MALLOC=ON \
        -DCMAKE_C_FLAGS="-w" \
        -DCMAKE_CXX_FLAGS="-w" && \
    # Limit parallel jobs to avoid OOM on smaller machines
    ninja -C _build -j$(( $(nproc) > 4 ? 4 : $(nproc) )) && \
    ninja -C _build install && \
    ldconfig && \
    rm -rf /tmp/webkitgtk-*

# Verify webkit2gtk-4.1 is available
RUN pkg-config --modversion webkit2gtk-4.1

# ---------------------------------------------------------------------------
# 4. Node.js 20.x
# ---------------------------------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 5. Rust toolchain (stable)
# ---------------------------------------------------------------------------
ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --profile minimal && \
    rustup target add x86_64-unknown-linux-gnu

# ---------------------------------------------------------------------------
# 6. Final verification
# ---------------------------------------------------------------------------
RUN echo "=== Build Environment ===" && \
    echo "glibc: $(ldd --version | head -1)" && \
    echo "gcc:   $(gcc --version | head -1)" && \
    echo "node:  $(node --version)" && \
    echo "npm:   $(npm --version)" && \
    echo "rustc: $(rustc --version)" && \
    echo "cargo: $(cargo --version)" && \
    echo "webkit2gtk-4.1: $(pkg-config --modversion webkit2gtk-4.1)" && \
    echo "libsoup-3.0:    $(pkg-config --modversion libsoup-3.0)" && \
    echo "========================="

WORKDIR /workspace
