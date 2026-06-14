import type { WorldState, SieveEntry } from '../types';
import type { EditionSelection } from './selector';
import { getMetric } from '../engine/metric-resolver';

// ============================================================
// PROMPT BUILDER
// Constructs the system and user prompts for the LLM
// translation layer. The prompt is the most important thing
// in the newspaper pipeline — a tight, specific prompt
// produces period-appropriate prose; a vague one produces
// generic fantasy writing.
//
// The prompt passes:
// - Der Weidenbote's editorial identity and constraints
// - Current world state (relevant metrics only)
// - The selected events as structured facts
// - Sieve context (what the town has been through)
// - Editorial pressure level (affects tone)
// ============================================================

// ============================================================
// SYSTEM PROMPT
// Sets Der Weidenbote's identity, voice, and constraints.
// ============================================================

export function buildSystemPrompt(): string {
  return `You are the voice of Der Weidenbote (The Pasture Messenger), a printing press broadsheet published in the small German market town of Schafweide in the late 15th century. The year is approximately 1467.

Der Weidenbote was founded by Heinrich Voss, a minor merchant with no guild affiliation who apprenticed briefly under a printer in Mainz before returning to Schafweide with a press and ambitions. The paper began as a commercial sheet reporting wool prices and market news. It has become, despite Voss's pragmatic instincts, increasingly entangled in the town's political life.

VOICE AND REGISTER:
- Use English, except when rendering direct language proper nouns (like Schafweide)
- Write in plain, direct vernacular prose — this is not courtly Latin, it is a working merchant's newspaper
- Sentences are declarative and functional. No flowery rhetoric.
- The tone is that of a careful, commercially-minded man who knows powerful people read every word he prints
- Voss is a pragmatist, not a crusader. He reports what he sees, but he knows what he cannot say directly.
- When reporting on the Church or the council, be oblique rather than confrontational — imply, suggest, report "it is said that" rather than accusing directly
- Trade, prices, and market conditions are always reported directly and without softening
- Labor disputes and guild tensions are reported factually but without taking sides openly

PERIOD AUTHENTICITY:
- Reference the Thursday wool market (Marktplatz), the monastery of Saint Aegidius on the hill, the river crossing maintained by the Hartmann family
- Measures of time: weeks, seasons, feast days
- Do not use anachronistic language. No "stakeholders", "infrastructure", "dynamics"
- Money is discussed in terms of local trade value, not abstract numbers
- Distance is measured in hours of travel, not miles or kilometers

FORMAT RULES — FOLLOW EXACTLY:
- Output ONLY the newspaper content. No preamble, no explanation, no commentary outside the broadsheet itself.
- Structure: MASTHEAD, then LEAD STORY, then SECONDARY STORIES, then BRIEF ITEMS
- Each story has a headline in ALL CAPS, then body text of 3-5 sentences
- Brief items are single sentences only
- End with a PRINTER'S NOTE — one short sentence from Voss himself, in first person, about the act of printing this edition`;
}

// ============================================================
// WORLD CONTEXT
// Summarizes the current metric state in plain language
// for the LLM to use as background.
// ============================================================

function buildWorldContext(state: WorldState): string {
  const m = state.metrics;

  const tradeCondition = m.economic.tradeFlow < 15
    ? 'severely depressed — the Thursday market is near-empty'
    : m.economic.tradeFlow < 30
    ? 'significantly below normal — fewer traders than expected'
    : m.economic.tradeFlow < 45
    ? 'somewhat slow — the market is quieter than usual'
    : 'reasonably active';

  const woolCondition = m.economic.woolMarketPrice < 25
    ? 'at ruinous lows not seen in memory'
    : m.economic.woolMarketPrice < 35
    ? 'well below fair value'
    : m.economic.woolMarketPrice < 45
    ? 'below what sellers would wish'
    : 'holding at acceptable levels';

  const guildMood = m.economic.guildTension > 75
    ? 'at open breaking point — disputes are public and heated'
    : m.economic.guildTension > 60
    ? 'strained — old grievances are surfacing'
    : m.economic.guildTension > 45
    ? 'tense but contained'
    : 'relatively settled';

  const churchStanding = m.political.churchInfluence > 75
    ? 'commanding — the monastery speaks and the town listens'
    : m.political.churchInfluence > 60
    ? 'strong — the Abbot carries real weight in civic affairs'
    : 'present but contested';

  const councilStanding = m.political.councilLegitimacy < 30
    ? 'near-collapse — the three families struggle to project authority'
    : m.political.councilLegitimacy < 45
    ? 'weakened — the council has lost credibility with many residents'
    : m.political.councilLegitimacy < 60
    ? 'functional but strained'
    : 'holding reasonable authority';

  const publicMood = m.social.publicUnrest > 60
    ? 'openly agitated — trouble could ignite from any spark'
    : m.social.publicUnrest > 45
    ? 'restless and suspicious'
    : m.social.publicUnrest > 30
    ? 'uneasy but not yet volatile'
    : 'relatively calm';

  const pressCondition = m.infrastructure.pressOperationalStatus < 40
    ? 'operating under significant constraint — this edition may be abbreviated'
    : m.infrastructure.pressOperationalStatus < 55
    ? 'operating carefully, aware of scrutiny'
    : 'operating with reasonable freedom';

  const healthNote = m.social.populationHealth < 40
    ? 'The town has been marked by illness recently.'
    : m.social.populationHealth < 55
    ? 'Health in the town is middling.'
    : 'The population is in reasonable health.';

  return `CURRENT CONDITION OF SCHAFWEIDE (${state.inWorldDate}):
- Trade at the Thursday market: ${tradeCondition}
- Wool prices: ${woolCondition}
- Guild relations: ${guildMood}
- The Church's standing: ${churchStanding}
- The council's standing: ${councilStanding}
- Public mood: ${publicMood}
- Der Weidenbote's situation: ${pressCondition}
- ${healthNote}`;
}

// ============================================================
// SIEVE CONTEXT
// Provides relevant historical background from the sieve
// so the LLM can write with awareness of prior events.
// ============================================================

function buildSieveContext(
  state: WorldState,
  selection: EditionSelection
): string {
  if (state.recentSieveEntries.length === 0) return '';

  // Find entries that are ancestors of the selected stories
  const relevantIds = new Set<string>();
  const allSelected = [
    selection.leadStory,
    ...selection.secondaryStories,
    ...selection.briefItems,
  ];

  for (const entry of allSelected) {
    entry.causedBy.forEach(id => relevantIds.add(id));
  }

  const historicalContext = state.recentSieveEntries
    .filter(e => relevantIds.has(e.id) && e.tick < selection.coveragePeriod.fromTick)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 5)
    .map(e => `- ${e.currentFidelity === 'FRAGMENT' ? e.fragment : e.summary}`)
    .join('\n');

  if (!historicalContext) return '';

  return `RELEVANT BACKGROUND (prior events informing current coverage):
${historicalContext}`;
}

// ============================================================
// ENTRY TO PROSE BRIEF
// Converts a sieve entry to a structured brief for the LLM.
// ============================================================

function entryToBrief(entry: SieveEntry, state: WorldState): string {
  const poiNote = entry.poiRefs.length > 0
    ? (() => {
        const poi = state.personsOfInterest[entry.poiRefs[0]!];
        return poi ? ` Key figure: ${poi.name}, ${poi.role}.` : '';
      })()
    : '';

  const ancestorNote = entry.causedBy.length > 2
    ? ` (This follows from ${entry.causedBy.length} prior events — it is the culmination of ongoing pressures.)`
    : '';

  return `EVENT: ${entry.fragment}
DETAILS: ${entry.currentFidelity === 'FULL' ? entry.description : entry.summary}${poiNote}${ancestorNote}
TAGS: ${entry.tags.join(', ')}`;
}

// ============================================================
// USER PROMPT
// The per-edition prompt that tells the LLM exactly what
// to write for this specific broadsheet.
// ============================================================

export function buildUserPrompt(
  state: WorldState,
  selection: EditionSelection
): string {
  const worldContext = buildWorldContext(state);
  const sieveContext = buildSieveContext(state, selection);

  const pressureToneNote = selection.editorialPressure > 0.6
    ? 'NOTE: Der Weidenbote is under significant pressure this edition. Write with notable caution — avoid direct accusation, favor oblique reporting, and keep the printer\'s note brief and careful.'
    : selection.editorialPressure > 0.3
    ? 'NOTE: Voss is aware of scrutiny this edition. Some restraint in the political coverage is appropriate.'
    : 'NOTE: The press is operating with reasonable freedom this edition. Voss may write with his usual directness.';

  const suppressionNote = selection.suppressedTopics.length > 0
    ? `SUPPRESSED TOPICS THIS EDITION: Do not directly report on the following — ${selection.suppressedTopics.join(', ')}. If these topics must be mentioned, do so only obliquely.`
    : '';

  const leadBrief = entryToBrief(selection.leadStory, state);
  const secondaryBriefs = selection.secondaryStories
    .map((s, i) => `SECONDARY STORY ${i + 1}:\n${entryToBrief(s, state)}`)
    .join('\n\n');
  const briefItems = selection.briefItems
    .map((b, i) => `BRIEF ${i + 1}: ${b.fragment}`)
    .join('\n');

  return `Write one edition of Der Weidenbote for ${state.inWorldDate}.

${worldContext}

${sieveContext ? sieveContext + '\n\n' : ''}${pressureToneNote}
${suppressionNote ? suppressionNote + '\n\n' : ''}
STORIES TO COVER:

LEAD STORY (write 4-5 sentences):
${leadBrief}

${secondaryBriefs ? secondaryBriefs + '\n\n' : ''}${briefItems ? 'BRIEF ITEMS (one sentence each):\n' + briefItems : ''}

Write the complete broadsheet now. Output ONLY the newspaper content — no explanation, no preamble.`;
}