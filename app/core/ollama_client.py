import requests
import json
import re
from typing import List, Dict, Any, Optional
from app.core.config import OLLAMA_BASE_URL, DEFAULT_VISION_MODEL, DEFAULT_TEXT_MODEL

class OllamaClient:
    def __init__(self, base_url: str = OLLAMA_BASE_URL):
        self.base_url = base_url.rstrip("/")

    def check_health(self) -> Dict[str, Any]:
        """Checks if the local Ollama server is reachable and lists available models."""
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                
                best_text = DEFAULT_TEXT_MODEL
                if any("3.8" in m for m in models):
                    best_text = next((m for m in models if "3.8" in m), DEFAULT_TEXT_MODEL)
                elif DEFAULT_TEXT_MODEL not in models and models:
                    best_text = next((m for m in models if "3.6" in m or "32b" in m or "coder" in m), models[0])
                    
                best_vision = DEFAULT_VISION_MODEL
                if any("3.8" in m for m in models):
                    best_vision = next((m for m in models if "3.8" in m), DEFAULT_VISION_MODEL)
                elif DEFAULT_VISION_MODEL not in models and models:
                    best_vision = models[0]
                    
                return {
                    "online": True,
                    "models": models,
                    "default_vision_model": best_vision,
                    "default_text_model": best_text
                }
            return {"online": False, "error": f"Status code {resp.status_code}", "models": []}
        except Exception as e:
            return {"online": False, "error": str(e), "models": []}

    def get_workload_status(self) -> Dict[str, Any]:
        """Queries Ollama /api/ps to report current loaded model, memory footprint, and activity."""
        try:
            resp = requests.get(f"{self.base_url}/api/ps", timeout=3)
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("models", [])
                formatted_models = []
                for m in models:
                    size_gb = round(m.get("size", 0) / (1024**3), 2)
                    size_vram_gb = round(m.get("size_vram", 0) / (1024**3), 2)
                    formatted_models.append({
                        "name": m.get("name"),
                        "model": m.get("model"),
                        "size_gb": size_gb,
                        "size_vram_gb": size_vram_gb,
                        "expires_at": m.get("expires_at")
                    })
                return {
                    "online": True,
                    "active_models": formatted_models,
                    "is_busy": len(formatted_models) > 0,
                    "model_count": len(formatted_models)
                }
            return {"online": True, "active_models": [], "is_busy": False, "model_count": 0}
        except Exception as e:
            return {"online": False, "error": str(e), "active_models": [], "is_busy": False, "model_count": 0}

    def generate_chat(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        format_json: bool = False,
        temperature: float = 0.1,
        max_retries: int = 1,
        timeout: int = 180,
        num_ctx: int = 4096,
        num_predict: Optional[int] = None,
        reasoning_effort: str = "none",
        keep_alive: str = "10m"
    ) -> Dict[str, Any]:
        """
        Calls Ollama /api/chat with support for multimodal messages (text + images base64)
        and tiered reasoning budget control (none, low, medium, high).
        keep_alive controls how long the model stays loaded in VRAM after the request.
        """
        augmented_messages = [dict(m) for m in messages]
        
        # Inject reasoning directives based on requested effort
        if reasoning_effort == "none":
            directive = "[REASONING DIRECTIVE]: Do not generate internal thoughts or thinking tokens. Output the result immediately."
            if augmented_messages and augmented_messages[0].get("role") == "system":
                augmented_messages[0]["content"] += f"\n{directive}"
            else:
                augmented_messages.insert(0, {"role": "system", "content": directive})
        elif reasoning_effort == "low":
            directive = "[REASONING DIRECTIVE]: Use minimal low reasoning (under 2 lines) strictly to verify coordinates/axes, then produce output."
            if augmented_messages and augmented_messages[0].get("role") == "system":
                augmented_messages[0]["content"] += f"\n{directive}"
            else:
                augmented_messages.insert(0, {"role": "system", "content": directive})
        elif reasoning_effort == "medium":
            directive = "[REASONING DIRECTIVE]: Use moderate focused step-by-step reasoning to evaluate rubric criteria and calculate partial marks."
            if augmented_messages and augmented_messages[0].get("role") == "system":
                augmented_messages[0]["content"] += f"\n{directive}"
            else:
                augmented_messages.insert(0, {"role": "system", "content": directive})
                
        opts = {
            "temperature": temperature,
            "num_ctx": num_ctx
        }
        if num_predict is not None:
            opts["num_predict"] = num_predict

        payload = {
            "model": model,
            "messages": augmented_messages,
            "stream": False,
            "keep_alive": keep_alive,
            "options": opts
        }
        if format_json:
            payload["format"] = "json"

        for attempt in range(max_retries):
            try:
                resp = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=timeout)
                if resp.status_code == 200:
                    data = resp.json()
                    msg_obj = data.get("message", {})
                    content = msg_obj.get("content", "")
                    thinking = msg_obj.get("thinking", "")
                    
                    # Clean any thinking tags from content
                    clean_content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                    if not clean_content and thinking:
                        clean_content = thinking.strip()

                    return {
                        "success": True,
                        "content": clean_content,
                        "thinking": thinking,
                        "raw": data
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Ollama API returned HTTP {resp.status_code}: {resp.text}"
                    }
            except Exception as e:
                if attempt == max_retries - 1:
                    return {
                        "success": False,
                        "error": f"Failed to reach Ollama: {str(e)}"
                    }
        return {"success": False, "error": "Unknown error in generate_chat"}

# Global singleton
ollama_client = OllamaClient()
