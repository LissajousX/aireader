use reqwest::Client;
use serde::{Deserialize, Serialize};

const OLLAMA_URL: &str = "http://localhost:11434/api/generate";
const MODEL_NAME: &str = "qwen3:8b";

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

pub struct OllamaClient {
    client: Client,
}

impl OllamaClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn generate(&self, prompt: &str) -> Result<String, String> {
        let request = OllamaRequest {
            model: MODEL_NAME.to_string(),
            prompt: prompt.to_string(),
            stream: false,
        };

        let response = self
            .client
            .post(OLLAMA_URL)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("请求 Ollama 失败: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Ollama 返回错误状态码: {}",
                response.status()
            ));
        }

        let ollama_response: OllamaResponse = response
            .json()
            .await
            .map_err(|e| format!("解析 Ollama 响应失败: {}", e))?;

        Ok(ollama_response.response.trim().to_string())
    }
}
