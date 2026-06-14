import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { WorldState } from '../types';
import type { EditionSelection } from './selector';

// ============================================================
// NEWSPAPER RENDERER
// Takes the raw LLM output and wraps it in a properly
// formatted markdown file with metadata header.
//
// Output directory: output/newspapers/
// Filename: der-weidenbote-YYYY-MONTH-weekN.md
// ============================================================

function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildFilename(state: WorldState): string {
  const sanitized = sanitizeFilename(state.inWorldDate);
  return `der-weidenbote-${sanitized}.md`;
}

function buildMetadataHeader(
  state: WorldState,
  selection: EditionSelection
): string {
  const metrics = state.metrics;

  return `---
publication: Der Weidenbote
edition_date: ${state.inWorldDate}
simulation_tick: ${state.currentTick}
coverage_period: ${selection.coveragePeriod.fromDate} – ${selection.coveragePeriod.toDate}
editorial_pressure: ${(selection.editorialPressure * 100).toFixed(0)}%
suppressed_topics: ${selection.suppressedTopics.join(', ') || 'none'}

# Simulation State at Publication
trade_flow: ${metrics.economic.tradeFlow.toFixed(1)}
wool_price: ${metrics.economic.woolMarketPrice.toFixed(1)}
guild_tension: ${metrics.economic.guildTension.toFixed(1)}
church_influence: ${metrics.political.churchInfluence.toFixed(1)}
council_legitimacy: ${metrics.political.councilLegitimacy.toFixed(1)}
public_unrest: ${metrics.social.publicUnrest.toFixed(1)}
press_status: ${metrics.infrastructure.pressOperationalStatus.toFixed(1)}
literacy_rate: ${metrics.social.literacyRate.toFixed(1)}
information_spread: ${metrics.social.informationSpread.toFixed(1)}
---

`;
}

function buildMarkdownBody(
  llmOutput: string,
  state: WorldState,
  selection: EditionSelection
): string {
  // Clean up any preamble the model might have added
  // despite instructions — strip lines before the first
  // all-caps heading or "DER WEIDENBOTE"
  const lines = llmOutput.split('\n');
  let startIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    // Look for masthead or first all-caps headline
    if (
      line.includes('DER WEIDENBOTE') ||
      line.includes('WEIDENBOTE') ||
      (line.length > 5 && line === line.toUpperCase() && /[A-Z]{3}/.test(line))
    ) {
      startIndex = i;
      break;
    }
  }

  const cleanedOutput = lines.slice(startIndex).join('\n').trim();

  // Wrap in markdown formatting
  return `# Der Weidenbote
### ${state.inWorldDate} | Schafweide

---

${cleanedOutput}

---

*Published by H. Voss, Printer, Marktplatz, Schafweide*
*${selection.coveragePeriod.fromDate} – ${selection.coveragePeriod.toDate}*
`;
}

// ============================================================
// RENDER AND WRITE
// Main function — takes LLM output, formats it, writes file.
// Returns the path of the written file.
// ============================================================

export function renderNewspaper(
  llmOutput: string,
  state: WorldState,
  selection: EditionSelection
): string {
  const outputDir = join(process.cwd(), 'output', 'newspapers');

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  const filename = buildFilename(state);
  const filepath = join(outputDir, filename);

  const metadata = buildMetadataHeader(state, selection);
  const body = buildMarkdownBody(llmOutput, state, selection);
  const fullContent = metadata + body;

  writeFileSync(filepath, fullContent, 'utf-8');

  console.log(`[Newspaper] Written to: output/newspapers/${filename}`);
  return filepath;
}