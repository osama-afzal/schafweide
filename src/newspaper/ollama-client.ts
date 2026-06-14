// ============================================================
// OLLAMA CLIENT
// Handles communication with the local Ollama API.
// Ollama exposes a REST API at localhost:11434 that accepts
// standard chat completion requests.
//
// No API key. No authentication. No cost.
// Just a local model running a physical machine.
// ============================================================

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  model?: string;
  temperature?: number;
  num_predict?: number;    // max tokens to generate
}

// ============================================================
// HEALTH CHECK
// Verifies Ollama is running before attempting generation.
// ============================================================

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================
// MODEL CHECK
// Verifies the requested model is available locally.
// ============================================================

export async function checkModelAvailable(model: string = DEFAULT_MODEL): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json() as { models: { name: string }[] };
    return data.models.some(m => m.name.startsWith(model));
  } catch {
    return false;
  }
}

// ============================================================
// CHAT COMPLETION
// Sends a conversation to Ollama and returns the response.
// Uses the /api/chat endpoint which supports system prompts.
// ============================================================

export async function ollamaChat(
  messages: OllamaMessage[],
  options: OllamaOptions = {}
): Promise<string> {
  const model = options.model ?? DEFAULT_MODEL;

  console.log(`[Ollama] Generating with ${model}...`);
  const startTime = Date.now();

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.num_predict ?? 1024,
        },
      }),
      // Generous timeout — local models can be slow
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${error}`);
    }

    const data = await response.json() as {
      message: { content: string };
      done: boolean;
      eval_count?: number;
      eval_duration?: number;
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const tokensPerSec = data.eval_count && data.eval_duration
      ? (data.eval_count / (data.eval_duration / 1e9)).toFixed(1)
      : 'unknown';

    console.log(`[Ollama] Generated in ${elapsed}s (${tokensPerSec} tokens/sec)`);

    return data.message.content.trim();

  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('[Ollama] Generation timed out after 120 seconds.');
    }
    throw err;
  }
}