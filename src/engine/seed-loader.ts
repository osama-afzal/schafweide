import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  WorldState,
  CityMetrics,
  Institution,
  PersonOfInterest,
  SieveEntry,
  EventTemplate,
} from '../types';
import { DEFAULT_CONFIG } from './config';

// ============================================================
// SEED LOADER
// Reads world.json and event-templates.json from data/seed/
// and constructs the initial WorldState for Urwerk to operate on.
// This runs exactly once on engine startup.
// ============================================================

// Raw JSON shapes — intentionally loose since we validate below
interface RawWorld {
  cityName: string;
  settingDescription: string;
  startYear: number;
  startWeek: number;
  currentTick: number;
  inWorldDate: string;
  initialMetrics: {
    economic: Record<string, number>;
    political: Record<string, number>;
    social: Record<string, number>;
    infrastructure: Record<string, number>;
  };
  institutions: Record<string, unknown>[];
  personsOfInterest: Record<string, unknown>[];
  initialSieveEntries: Record<string, unknown>[];
}

interface RawTemplates {
  templates: Record<string, unknown>[];
}

// ============================================================
// FILE LOADING
// ============================================================

function loadJson<T>(filename: string): T {
  const seedPath = join(process.cwd(), 'data', 'seed', filename);
  try {
    const raw = readFileSync(seedPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Seed loader: failed to read ${filename}.\n${err}`);
  }
}

// ============================================================
// METRIC CONSTRUCTION
// Builds a typed CityMetrics object from the raw JSON shape.
// Clamps all values to 0-100.
// ============================================================

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function buildMetrics(raw: RawWorld, tick: number, inWorldDate: string): CityMetrics {
  const e = raw.initialMetrics.economic;
  const p = raw.initialMetrics.political;
  const s = raw.initialMetrics.social;
  const i = raw.initialMetrics.infrastructure;

  // Validate all expected keys are present
  const requiredEconomic = ['grainSupply', 'tradeFlow', 'guildTension', 'woolMarketPrice'];
  const requiredPolitical = ['imperialAuthority', 'churchInfluence', 'councilLegitimacy', 'legalStability'];
  const requiredSocial = ['publicUnrest', 'literacyRate', 'informationSpread', 'populationHealth'];
  const requiredInfrastructure = ['pressOperationalStatus', 'roadCondition', 'riverCrossingIntegrity'];

  for (const key of requiredEconomic) {
    if (e[key] === undefined) throw new Error(`Seed loader: missing economic metric '${key}'`);
  }
  for (const key of requiredPolitical) {
    if (p[key] === undefined) throw new Error(`Seed loader: missing political metric '${key}'`);
  }
  for (const key of requiredSocial) {
    if (s[key] === undefined) throw new Error(`Seed loader: missing social metric '${key}'`);
  }
  for (const key of requiredInfrastructure) {
    if (i[key] === undefined) throw new Error(`Seed loader: missing infrastructure metric '${key}'`);
  }

  return {
    tick,
    inWorldDate,
    economic: {
      grainSupply: clamp(e.grainSupply!),
      tradeFlow: clamp(e.tradeFlow!),
      guildTension: clamp(e.guildTension!),
      woolMarketPrice: clamp(e.woolMarketPrice!),
    },
    political: {
      imperialAuthority: clamp(p.imperialAuthority!),
      churchInfluence: clamp(p.churchInfluence!),
      councilLegitimacy: clamp(p.councilLegitimacy!),
      legalStability: clamp(p.legalStability!),
    },
    social: {
      publicUnrest: clamp(s.publicUnrest!),
      literacyRate: clamp(s.literacyRate!),
      informationSpread: clamp(s.informationSpread!),
      populationHealth: clamp(s.populationHealth!),
    },
    infrastructure: {
      pressOperationalStatus: clamp(i.pressOperationalStatus!),
      roadCondition: clamp(i.roadCondition!),
      riverCrossingIntegrity: clamp(i.riverCrossingIntegrity!),
    },
  };
}

// ============================================================
// IN-WORLD DATE CALCULATION
// Converts tick number to a human-readable in-world date.
// Tick 0 = startWeek of startYear.
// ============================================================

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function tickToDate(tick: number, startYear: number, startWeek: number): {
  date: string;
  year: number;
  week: number;
} {
  const totalWeeks = startWeek + tick;
  const year = startYear + Math.floor(totalWeeks / 52);
  const week = ((totalWeeks % 52) + 52) % 52 || 52;
  const monthIndex = Math.floor((week - 1) / 4.33);
  const month = MONTH_NAMES[Math.min(monthIndex, 11)];
  return {
    date: `${month}, ${year}`,
    year,
    week,
  };
}

// ============================================================
// INSTITUTION LOADING
// Casts raw JSON objects to Institution type.
// ============================================================

function loadInstitutions(raw: RawWorld): Record<string, Institution> {
  const result: Record<string, Institution> = {};
  for (const inst of raw.institutions) {
    const i = inst as unknown as Institution;
    if (!i.id) throw new Error(`Seed loader: institution missing 'id'`);
    result[i.id] = i;
  }
  return result;
}

// ============================================================
// POI LOADING
// ============================================================

function loadPOIs(raw: RawWorld): Record<string, PersonOfInterest> {
  const result: Record<string, PersonOfInterest> = {};
  for (const poi of raw.personsOfInterest) {
    const p = poi as unknown as PersonOfInterest;
    if (!p.id) throw new Error(`Seed loader: POI missing 'id'`);
    result[p.id] = p;
  }
  return result;
}

// ============================================================
// SIEVE LOADING
// ============================================================

function loadSieveEntries(raw: RawWorld): SieveEntry[] {
  return raw.initialSieveEntries.map(entry => entry as unknown as SieveEntry);
}

// ============================================================
// EVENT TEMPLATE LOADING
// ============================================================

function loadEventTemplates(raw: RawTemplates): Record<string, EventTemplate> {
  const result: Record<string, EventTemplate> = {};
  for (const template of raw.templates) {
    const t = template as unknown as EventTemplate;
    if (!t.id) throw new Error(`Seed loader: event template missing 'id'`);
    result[t.id] = t;
  }
  return result;
}

// ============================================================
// MAIN LOADER
// Constructs the complete initial WorldState.
// ============================================================

export function loadSeedData(): WorldState {
  console.log('[Urwerk] Loading seed data...');

  const worldRaw = loadJson<RawWorld>('world.json');
  const templatesRaw = loadJson<RawTemplates>('event-templates.json');

  const { startYear, startWeek, currentTick, cityName, settingDescription } = worldRaw;
  const { date, year, week } = tickToDate(currentTick, startYear, startWeek);

  const metrics = buildMetrics(worldRaw, currentTick, date);
  const institutions = loadInstitutions(worldRaw);
  const personsOfInterest = loadPOIs(worldRaw);
  const sieveEntries = loadSieveEntries(worldRaw);
  const eventTemplates = loadEventTemplates(templatesRaw);

  console.log(`[Urwerk] Loaded ${Object.keys(institutions).length} institutions`);
  console.log(`[Urwerk] Loaded ${Object.keys(personsOfInterest).length} persons of interest`);
  console.log(`[Urwerk] Loaded ${sieveEntries.length} sieve entries`);
  console.log(`[Urwerk] Loaded ${Object.keys(eventTemplates).length} event templates`);
  console.log(`[Urwerk] World state initialized: ${cityName}, ${date}`);

  const state: WorldState = {
    cityName,
    settingDescription,
    currentTick,
    inWorldDate: date,
    inWorldYear: year,
    inWorldWeek: week,
    metrics,
    recentSnapshots: [{ tick: currentTick, metrics }],
    institutions,
    personsOfInterest,
    activeEvents: [],
    pendingImpacts: [],
    eventTemplates,
    lastDiceRoll: null,
    activeCausalChains: [],
    centralityScores: [],
    recentSieveEntries: sieveEntries,
    sieveSummaries: [],
  };

  return state;
}