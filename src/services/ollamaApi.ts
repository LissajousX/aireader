// Ollama API 服务 - 获取模型列表等

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

// 获取可用模型列表
export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: OllamaTagsResponse = await response.json();
    return data.models || [];
  } catch (error) {
    console.error("[Ollama] 获取模型列表失败:", error);
    return [];
  }
}

// 测试 Ollama 连接
export async function testOllamaConnection(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
    return response.ok;
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
