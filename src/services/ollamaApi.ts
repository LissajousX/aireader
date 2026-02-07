// Ollama API 服务 - 获取模型列表等（通过 Rust 后端代理，绕过 WebView CORS 限制）
import { invoke } from '@tauri-apps/api/core';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

// 获取可用模型列表
export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    return await invoke<OllamaModel[]>('ollama_list_models', { baseUrl });
  } catch (error) {
    console.error("[Ollama] 获取模型列表失败:", error);
    return [];
  }
}

// 测试 Ollama 连接
export async function testOllamaConnection(baseUrl: string): Promise<boolean> {
  try {
    return await invoke<boolean>('ollama_test_connection', { baseUrl });
  } catch (error) {
    console.error("[Ollama] 连接测试失败:", error);
    return false;
  }
}

// 格式化模型大小
export function formatModelSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
