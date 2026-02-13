# =============================================================================
# Tauri v2 build environment on Ubuntu 20.04 (Focal Fossa)
#
# Why: Tauri v2 requires libwebkit2gtk-4.1 which depends on libsoup3.
#       Ubuntu 20.04 only ships webkit2gtk-4.0 + libsoup2.4.
#       This image builds GLib 2.72 + libsoup3 + WebKitGTK 2.40 from source
#       so the resulting Tauri binaries link against glibc 2.31 (focal's glibc),
#       making them compatible with Ubuntu 20.04+.
#
# Dependency chain built from source:
#       GLib 2.72.4 → libsoup 3.0.8 → WebKitGTK 2.40.5
#
# NOTE: WebKitGTK compilation is VERY heavy (~60-120 min, ~8 GB RAM).
#       Build this image on a machine with ≥16 GB RAM and ≥4 cores.
#       Once built, push to registry and reuse in CI.
# =============================================================================

FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
# Ensure pkg-config finds .pc files from both system and source-built libraries
ENV PKG_CONFIG_PATH=/usr/local/lib/x86_64-linux-gnu/pkgconfig:/usr/local/lib/pkgconfig:/usr/local/share/pkgconfig:/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig

# ---------------------------------------------------------------------------
# 1. System packages from focal repos
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Essential build tools
    build-essential pkg-config git curl wget ca-certificates \
    python3 python3-pip ninja-build software-properties-common \
    # GLib build deps
    libffi-dev libpcre2-dev libmount-dev gettext \
    # Tauri / GTK runtime & dev deps
    libgtk-3-dev libgdk-pixbuf2.0-dev libglib2.0-dev \
    libappindicator3-dev librsvg2-dev patchelf \
    # WebKitGTK build deps
    libicu-dev libxml2-dev libxslt1-dev libsqlite3-dev \
    libgcrypt20-dev \
    libnghttp2-dev libpsl-dev liblcms2-dev \
    libenchant-dev libsecret-1-dev libnotify-dev libhyphen-dev \
    libopenjp2-7-dev libwoff-dev libtasn1-6-dev \
    libxt-dev libx11-dev libxcomposite-dev libxdamage-dev \
    libwayland-dev libwayland-client0 libwayland-server0 \
    libegl1-mesa-dev libgl1-mesa-dev libgles2-mesa-dev \
    libgbm-dev libdrm-dev \
    libatk1.0-dev libatk-bridge2.0-dev libepoxy-dev \
    libharfbuzz-dev libcairo2-dev libpango1.0-dev \
    libjpeg-dev libpng-dev libwebp-dev \
    gobject-introspection libgirepository1.0-dev \
    ruby-dev libmanette-0.2-dev unifdef gperf \
    # Needed for Node.js install
    gnupg lsb-release \
    # OpenSSL (needed by rust openssl-sys crate)
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 1b. Install GCC 11 from ubuntu-toolchain-r PPA
#     focal's GCC 9 cannot compile WebKitGTK 2.40 (C++20 defaulted operator==)
# ---------------------------------------------------------------------------
RUN add-apt-repository -y ppa:ubuntu-toolchain-r/test && \
    apt-get update && \
    apt-get install -y gcc-11 g++-11 && \
    update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-11 110 \
                        --slave /usr/bin/g++ g++ /usr/bin/g++-11 && \
    update-alternatives --install /usr/bin/cc cc /usr/bin/gcc-11 110 && \
    update-alternatives --install /usr/bin/c++ c++ /usr/bin/g++-11 110 && \
    rm -rf /var/lib/apt/lists/* && \
    echo "gcc: $(gcc --version | head -1)"

# focal's meson is too old for GLib 2.72 / libsoup3;
# focal's cmake 3.16 is too old for WebKitGTK 2.40 (needs >= 3.20)
RUN pip3 install --upgrade pip && pip3 install meson cmake

# Verify pip-installed cmake (>= 3.20) takes precedence over system cmake
RUN cmake --version

# ---------------------------------------------------------------------------
# 2. Build GLib 2.72.4 from source
#    (focal ships 2.64; libsoup 3.x needs >= 2.69; WebKitGTK 2.40 needs >= 2.70)
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
        -Dlibelf=disabled \
        -Dlibmount=enabled && \
    ninja -C _build -j$(nproc) && \
    ninja -C _build install && \
    ldconfig && \
    echo "GLib installed: $(pkg-config --modversion glib-2.0)" && \
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
    echo "libsoup installed: $(pkg-config --modversion libsoup-3.0)" && \
    rm -rf /tmp/libsoup-*

# ---------------------------------------------------------------------------
# 4. Build WebKitGTK 2.42.5 from source (GTK port, 4.1 API only)
#    wry 0.54.1 (used by Tauri 2.x) requires >= 2.42 for
#    webkit_cookie_manager_get_all_cookies API.
#    Built with GCC 11 to avoid C++20 issues; GStreamer disabled (focal's
#    1.16 lacks GST_TIMEP_FORMAT macro required by 2.42, and Tauri doesn't
#    need media playback).
# ---------------------------------------------------------------------------
ARG WEBKIT_VERSION=2.42.5
RUN cd /tmp && \
    wget -q https://webkitgtk.org/releases/webkitgtk-${WEBKIT_VERSION}.tar.xz && \
    tar xf webkitgtk-${WEBKIT_VERSION}.tar.xz && \
    cd webkitgtk-${WEBKIT_VERSION} && \
    cmake -B _build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DCMAKE_C_COMPILER=/usr/bin/gcc-11 \
        -DCMAKE_CXX_COMPILER=/usr/bin/g++-11 \
        -DPORT=GTK \
        -DUSE_SOUP2=OFF \
        -DUSE_GTK4=OFF \
        -DUSE_WPE_RENDERER=OFF \
        -DUSE_AVIF=OFF \
        -DUSE_JPEGXL=OFF \
        -DUSE_SYSTEM_MALLOC=ON \
        -DUSE_GSTREAMER=OFF \
        -DENABLE_BUBBLEWRAP_SANDBOX=OFF \
        -DENABLE_DOCUMENTATION=OFF \
        -DENABLE_MINIBROWSER=OFF \
        -DENABLE_GAMEPAD=OFF \
        -DENABLE_SPELLCHECK=OFF \
        -DENABLE_INTROSPECTION=OFF \
        -DENABLE_GEOLOCATION=OFF \
        -DENABLE_VIDEO=OFF \
        -DENABLE_WEB_AUDIO=OFF \
        -DENABLE_MEDIA_SOURCE=OFF \
        -DUSE_SYSTEMD=OFF \
        -DENABLE_JOURNALD_LOG=OFF \
        -DENABLE_WAYLAND_TARGET=OFF \
        -DCMAKE_C_FLAGS="-w" \
        -DCMAKE_CXX_FLAGS="-w" && \
    ninja -C _build -j$(nproc) && \
    ninja -C _build install && \
    ldconfig && \
    rm -rf /tmp/webkitgtk-*

# Verify webkit2gtk-4.1 >= 2.42 (wry 0.54.1 requires get_all_cookies from 2.42+)
RUN pkg-config --print-errors 'webkit2gtk-4.1 >= 2.42' && \
    echo "webkit2gtk-4.1: $(pkg-config --modversion webkit2gtk-4.1)" && \
    echo "javascriptcoregtk-4.1: $(pkg-config --modversion javascriptcoregtk-4.1)"

# ---------------------------------------------------------------------------
# 5. Node.js 20.x
# ---------------------------------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 6. Rust toolchain (stable)
# ---------------------------------------------------------------------------
ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --profile minimal && \
    rustup target add x86_64-unknown-linux-gnu

# ---------------------------------------------------------------------------
# 7. Final verification
# ---------------------------------------------------------------------------
RUN echo "=== Build Environment ===" && \
    echo "glibc:              $(ldd --version | head -1)" && \
    echo "gcc:                $(gcc --version | head -1)" && \
    echo "cmake:              $(cmake --version | head -1)" && \
    echo "node:               $(node --version)" && \
    echo "npm:                $(npm --version)" && \
    echo "rustc:              $(rustc --version)" && \
    echo "cargo:              $(cargo --version)" && \
    echo "glib-2.0:           $(pkg-config --modversion glib-2.0)" && \
    echo "libsoup-3.0:        $(pkg-config --modversion libsoup-3.0)" && \
    echo "webkit2gtk-4.1:     $(pkg-config --modversion webkit2gtk-4.1)" && \
    echo "javascriptcoregtk:  $(pkg-config --modversion javascriptcoregtk-4.1)" && \
    echo "========================="

WORKDIR /workspace
