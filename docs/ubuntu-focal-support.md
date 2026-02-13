# Ubuntu 20.04 (Focal Fossa) 适配总结

本文档记录 Aireader v1.1.0 适配 Ubuntu 20.04 过程中遇到的技术挑战与解决方案。

---

## 1. 背景

Ubuntu 20.04 的系统组件版本较低，与 Aireader 依赖的多个库存在兼容性问题：

| 组件 | Ubuntu 20.04 版本 | Aireader 需要 | 差距 |
|------|-------------------|--------------|------|
| glibc | 2.31 | ≥ 2.34 | llama.cpp 预编译二进制依赖高版本 glibc |
| WebKitGTK | 2.28 (系统源) | ≥ 4.1 API (2.42+) | Tauri 2.x 需要 webkit2gtk-4.1 |
| libstdc++ | GCC 9 | GCC 11+ | llama.cpp / WebKitGTK 编译需要 |
| JavaScriptCore | 旧版 | ES2024 | 缺少 `Promise.withResolvers` |

---

## 2. 构建环境

### Docker 镜像

基于 Ubuntu 20.04 构建专用 Docker 镜像 `ghcr.io/lissajousx/aireader-focal-build`，内含：

- **GCC 11**（通过 `ubuntu-toolchain-r/test` PPA）
- **自编译 WebKitGTK 2.42.5**（使用 GCC 11，禁用 GStreamer 和 WPE）
- **Rust toolchain** + **Node.js 22** + **Tauri CLI**
- **Vulkan SDK 1.3.283**（LunarG 官方 focal 源）

### CI 工作流

独立的 `.github/workflows/build-focal.yml`：

1. 使用 focal Docker 镜像作为构建容器
2. 在容器内用 GCC 11 编译 llama.cpp b7966（CPU + Vulkan 双版本）
3. 编译 Tauri 应用生成 AppImage
4. 注入 GCC 11 的 `libstdc++.so.6` 到 AppImage 内
5. 使用 `appimagetool` 重新打包

---

## 3. 关键问题与解决方案

### 3.1 glibc 2.34 不兼容

**问题**：官方预编译的 llama.cpp 二进制文件链接了 glibc ≥ 2.34，在 Ubuntu 20.04 (glibc 2.31) 上运行时报错：

```
GLIBC_2.34 not found (required by libggml.so.0)
```

**方案**：

1. **自编译**：在 focal 容器内用 GCC 11 编译 llama.cpp，生成与 glibc 2.31 兼容的二进制
2. **捆绑运行时**：将自编译的二进制打包进 AppImage，作为内置运行时
3. **自动检测**：Rust 后端通过 `ldd --version` 检测 glibc 版本，< 2.34 时自动使用捆绑运行时
4. **禁止在线下载**：glibc < 2.34 系统上禁用运行时在线下载（下载的预编译版本不兼容）
5. **兼容性验证**：`validate_runtime_binary` 函数运行 `--version` 检测 GLIBC 不兼容，自动移除无效运行时

```rust
// src-tauri/src/builtin_llm.rs
fn is_bundled_runtime_only() -> bool {
    // 检测 glibc 版本，< 2.34 返回 true
}
```

### 3.2 共享库加载失败 (libllama.so.0)

**问题**：即使使用自编译的运行时，`llama-bench` 仍报错：

```
libllama.so.0: cannot open shared object file: No such file or directory
```

**根因**（三个层面）：

1. **CI 打包缺陷**：`cp build/bin/libllama.so` 只复制了无版本号的符号链接，但二进制文件链接的 SONAME 是 `libllama.so.0`
2. **RPATH 错误**：cmake 默认将构建目录的绝对路径写入 RUNPATH，在用户机器上该路径不存在
3. **无 LD_LIBRARY_PATH**：Linux 动态链接器在 RPATH 失效时无法在 binary 同目录找到 `.so`

**方案**（三层防御）：

```yaml
# CI 编译时设置 RPATH 为 $ORIGIN（当前目录）
cmake -DCMAKE_BUILD_RPATH='$ORIGIN' ...

# CI 打包时保留版本号符号链接
cp -a build/bin/lib*.so* "$DIR/"
# 结果：libllama.so -> libllama.so.0 -> libllama.so.0.0.1 完整保留
```

```rust
// Rust 后端为所有 llama 进程设置 LD_LIBRARY_PATH 兜底
#[cfg(target_os = "linux")]
cmd.env("LD_LIBRARY_PATH", prepend_runtime_to_ld_path(&exe, &rt_dir));
```

### 3.3 PDF 解析卡在 "Parsing PDF..."

**问题**：打开 PDF 文件后永久停留在 "Parsing PDF..." 加载状态。

**根因分析**：

pdfjs-dist 4.8.69 使用 Web Worker 进行 PDF 解析。Worker 初始化流程：

1. 创建 `new Worker(workerSrc, { type: "module" })`
2. 通过 MessageHandler 发送 `test` 消息握手
3. Worker 响应 `test` → 设置 `_webWorker` → 握手成功
4. 用户打开 PDF → 发送解析请求 → Worker 调用 `Promise.withResolvers` → **崩溃**

关键：Worker 在握手阶段**不使用** `Promise.withResolvers`（整个 worker 文件中只有 1 处调用），所以握手成功。但 `_webWorker` 已设置后，Worker 的 `error` 事件处理器中 `if (!this._webWorker)` 为 false，**不会触发 fake worker 回退**。解析请求发出后永远收不到响应 → 卡死。

**方案**：

```typescript
// src/polyfills.ts — 必须是 main.tsx 的第一个 import
if (typeof Promise.withResolvers === "undefined") {
  // 1. 安装 polyfill
  Promise.withResolvers = function <T>() { ... };

  // 2. 预加载 worker 到主线程，设置 globalThis.pdfjsWorker
  //    pdfjs 检测到已有 WorkerMessageHandler 后跳过创建真实 Worker
  const workerUrl = "/pdf.worker.min.mjs";
  (window as any).__pdfWorkerReady = import(/* @vite-ignore */ workerUrl)
    .then(mod => { (globalThis as any).pdfjsWorker = mod; });
} else {
  (window as any).__pdfWorkerReady = Promise.resolve();
}
```

```typescript
// src/components/reader/PDFReader.tsx — 加载 PDF 前等待 worker 就绪
const loadPdf = async () => {
  await (window as any).__pdfWorkerReady;
  // ... 继续加载 PDF 文件
};
```

pdfjs 内部检测逻辑：

```javascript
// pdfjs-dist/build/pdf.mjs — PDFWorker._initialize()
if (PDFWorker.#isWorkerDisabled || PDFWorker.#mainThreadWorkerMessageHandler) {
  this._setupFakeWorker();  // ← 检测到预加载的 handler，直接走 fake worker
  return;
}
// #mainThreadWorkerMessageHandler 检查：
// globalThis.pdfjsWorker?.WorkerMessageHandler
```

### 3.4 workerSrc 裸模块名错误

**问题**：不设置 `workerSrc` 时，pdfjs 使用默认的 `pdf.worker.mjs`（裸模块标识符），在 fake worker 回退时 `import("pdf.worker.mjs")` 也失败：

```
Setting up fake worker failed: "Module name, 'pdf.worker.mjs' does not resolve to a valid URL."
```

**方案**：始终设置 `workerSrc` 为有效 URL：

```typescript
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
```

---

## 4. 测试验证

### 自动化测试

- **Rust 单元测试**：58 个测试（builtin_llm 37 + database 9 + epub 12），覆盖 glibc 检测、LD_LIBRARY_PATH、bundled-only 逻辑、模型管理等
- **前端测试**：263 个测试（15 个测试文件），覆盖 polyfill、下载配置、UI 组件等
- **TypeScript 编译**：`npx tsc --noEmit` 在 focal Docker 中通过

### Docker 端到端验证

```bash
# 模拟 CI 构建流程
cmake -DCMAKE_BUILD_RPATH='$ORIGIN' -DBUILD_SHARED_LIBS=ON ...
cmake --build build --target llama-bench llama-server

# 打包并提取到新目录
cp -a build/bin/lib*.so* runtime/
tar czf runtime.tar.gz runtime/

# 删除构建目录模拟用户环境
rm -rf llama.cpp/

# 验证：无 LD_LIBRARY_PATH 也能运行（$ORIGIN RPATH 生效）
runtime/llama-bench --help     # ✅ SUCCESS
runtime/llama-server --version # ✅ SUCCESS
```

---

## 5. 文件变更清单

| 文件 | 说明 |
|------|------|
| `docker/focal-build/Dockerfile` | focal 构建镜像定义 |
| `.github/workflows/build-focal.yml` | focal CI 工作流 |
| `src-tauri/src/builtin_llm.rs` | glibc 检测、bundled-only 模式、LD_LIBRARY_PATH |
| `src/polyfills.ts` | Promise.withResolvers polyfill + worker 预加载 |
| `src/main.tsx` | polyfill 必须为首个 import |
| `src/components/reader/PDFReader.tsx` | workerSrc 设置 + await worker ready |
| `src/components/setup/SetupWizard.tsx` | 内置 AI 可选提示 |
| `src/components/settings/SettingsModal.tsx` | 内置 AI 可选提示 |

---

## 6. 经验总结

1. **共享库打包必须保留 SONAME 符号链接**：`cp` 不带 `-a` 会解引用符号链接，导致 `libllama.so.0` 丢失
2. **始终设置 `CMAKE_BUILD_RPATH=$ORIGIN`**：默认 RPATH 包含构建机绝对路径，在部署环境无效
3. **Web Worker 的 polyfill 盲区**：Worker 有独立的 JS 上下文，主线程的 polyfill 不可见；Worker 握手成功不代表运行时稳定
4. **pdfjs fake worker 需要有效 URL**：不设置 `workerSrc` 时默认裸模块名在非 Node.js 环境下无法解析
5. **Docker 验证不可省略**：本地编译通过不代表目标环境可用，必须在 Docker 中模拟完整用户场景
