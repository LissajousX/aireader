use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: String,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

/// Test if Ollama is reachable at the given base URL.
#[tauri::command]
pub async fn ollama_test_connection(base_url: String) -> Result<bool, String> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    match client.get(&url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Fetch the list of available models from Ollama.
#[tauri::command]
pub async fn ollama_list_models(base_url: String) -> Result<Vec<OllamaModel>, String> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama connection failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", resp.status()));
    }
    let data: OllamaTagsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
    Ok(data.models.unwrap_or_default())
}

/// A single chunk emitted during streaming.
#[derive(Clone, Serialize)]
pub struct OllamaStreamChunk {
    /// "thinking", "content", "done", or "error"
    pub kind: String,
    /// The text payload (accumulated)
    pub text: String,
}

/// Stream a chat or generate request to Ollama, sending chunks back via Channel.
#[tauri::command]
pub async fn ollama_stream_chat(
    base_url: String,
    model: String,
    prompt: Option<String>,
    messages: Option<serde_json::Value>,
    think: Option<bool>,
    options: Option<serde_json::Value>,
    on_chunk: Channel<OllamaStreamChunk>,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let base = base_url.trim_end_matches('/');
    // think parameter: three states via Option<bool>
    //   Some(true)  → send "think":true   (enable thinking)
    //   Some(false) → send "think":false   (disable thinking, most models)
    //   None        → omit "think" param   (for buggy models like qwen3:4b where
    //                 think:false breaks; rely on /no_think prompt tag instead)
    let (url, mut body) = if let Some(msgs) = messages {
        let mut j = serde_json::json!({ "model": model, "messages": msgs, "stream": true });
        if let Some(t) = think {
            j.as_object_mut().unwrap().insert("think".to_string(), serde_json::json!(t));
        }
        (format!("{}/api/chat", base), j)
    } else {
        let p = prompt.unwrap_or_default();
        let mut j = serde_json::json!({ "model": model, "prompt": p, "stream": true });
        if let Some(t) = think {
            j.as_object_mut().unwrap().insert("think".to_string(), serde_json::json!(t));
        }
        (format!("{}/api/generate", base), j)
    };
    // Merge runtime options (e.g. temperature) into body
    if let Some(opts) = options {
        body.as_object_mut().unwrap().insert("options".to_string(), opts);
    }

    let body_str = serde_json::to_string(&body).unwrap();

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    // If the model doesn't support thinking (HTTP 400 + "does not support thinking"),
    // auto-retry without the think parameter so the user still gets a result.
    let resp = if !resp.status().is_success() && resp.status().as_u16() == 400 {
        let text = resp.text().await.unwrap_or_default();
        if text.contains("does not support thinking") {
            let _ = on_chunk.send(OllamaStreamChunk {
                kind: "warning".into(),
                text: "该模型不支持思考功能，已自动以普通模式运行".into(),
            });
            body.as_object_mut().unwrap().remove("think");
            let retry_body = serde_json::to_string(&body).unwrap();
            client
                .post(&url)
                .header("Content-Type", "application/json")
                .body(retry_body)
                .send()
                .await
                .map_err(|e| format!("Ollama retry failed: {}", e))?
        } else {
            return Err(format!("Ollama 返回错误 (HTTP 400): {}", text));
        }
    } else {
        resp
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 返回错误 (HTTP {}): {}", status, text));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut thinking_content = String::new();
    let mut main_content = String::new();

    while let Some(chunk_result) = stream.next().await {
        let bytes = chunk_result.map_err(|e| format!("Stream read error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Process complete lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let data: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Thinking content
            let think_delta = data
                .get("thinking")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !think_delta.is_empty() {
                // Also check message.thinking for /api/chat
                thinking_content.push_str(&think_delta);
                let _ = on_chunk.send(OllamaStreamChunk {
                    kind: "thinking".into(),
                    text: thinking_content.clone(),
                });
            }
            // /api/chat thinking is in message.thinking
            let msg_think = data
                .get("message")
                .and_then(|m| m.get("thinking"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !msg_think.is_empty() && think_delta.is_empty() {
                thinking_content.push_str(&msg_think);
                let _ = on_chunk.send(OllamaStreamChunk {
                    kind: "thinking".into(),
                    text: thinking_content.clone(),
                });
            }

            // Main content: /api/generate uses "response", /api/chat uses "message.content"
            let content_delta = data
                .get("response")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let msg_content = data
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let delta = if !content_delta.is_empty() {
                content_delta
            } else {
                msg_content
            };
            if !delta.is_empty() {
                main_content.push_str(&delta);
                let _ = on_chunk.send(OllamaStreamChunk {
                    kind: "content".into(),
                    text: main_content.clone(),
                });
            }

            // Done flag
            if data.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                let _ = on_chunk.send(OllamaStreamChunk {
                    kind: "done".into(),
                    text: String::new(),
                });
            }
        }
    }

    Ok(())
}
