import type { WorldState } from '../types';
import { selectEditionContent } from './selector';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import { checkOllamaHealth, checkModelAvailable, ollamaChat } from './ollama-client';
import { renderNewspaper } from './renderer';
import { saveEdition } from '../database';
import { readFileSync } from 'fs';

// ============================================================
// NEWSPAPER ORCHESTRATOR
// The single public function the rest of the system calls.
// Wires together: selection -> prompting -> generation -> render
//
// Call this after a simulation run to produce a newspaper
// edition covering the most recent events.
// ============================================================

const MODEL = 'llama3.1';

export async function publishEdition(
  state: WorldState,
  fromTick?: number
): Promise<string | null> {
  console.log('\n[Newspaper] Beginning edition generation...');

  // Step 1 — verify Ollama is running
  const healthy = await checkOllamaHealth();
  if (!healthy) {
    console.error(
      '[Newspaper] ERROR: Ollama is not running.\n' +
      '  Start it with: ollama serve\n' +
      '  Then try again.'
    );
    return null;
  }

  // Step 2 — verify model is available
  const modelAvailable = await checkModelAvailable(MODEL);
  if (!modelAvailable) {
    console.error(
      `[Newspaper] ERROR: Model '${MODEL}' not found.\n` +
      `  Pull it with: ollama pull ${MODEL}\n` +
      '  Then try again.'
    );
    return null;
  }

  // Step 3 — select edition content from sieve
  const selection = selectEditionContent(state, fromTick);
  if (!selection) {
    console.log('[Newspaper] No content to publish for this period.');
    return null;
  }

  // Step 4 — build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(state, selection);

  console.log(`[Newspaper] Prompting ${MODEL} for edition: ${state.inWorldDate}`);
  console.log(`[Newspaper] Coverage: ${selection.coveragePeriod.fromDate} – ${selection.coveragePeriod.toDate}`);

  // Step 5 — generate with Ollama
  let llmOutput: string;
  try {
    llmOutput = await ollamaChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model: MODEL,
        temperature: 0.75,  // slight creativity, period prose benefits from it
        num_predict: 1200,  // enough for a full broadsheet
      }
    );
  } catch (err) {
    console.error(`[Newspaper] Generation failed: ${err}`);
    return null;
  }

  // Step 6 — render and write
  const filepath = renderNewspaper(llmOutput, state, selection);

  // Read the written markdown content for DB storage
  let markdownContent = '';
  try {
    markdownContent = readFileSync(filepath, 'utf-8');
  } catch { /* non-fatal */ }

  // Record edition in database
  const filename = filepath.split(/[\\/]/).pop() ?? filepath;
  await saveEdition(state, selection, filename, markdownContent).catch(err =>
    console.warn(`[Newspaper] DB record failed: ${err}`)
  );

  console.log(`[Newspaper] Edition complete: ${filepath}`);
  return filepath;
}