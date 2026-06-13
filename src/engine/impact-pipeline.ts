import type {
  WorldState,
  GameEvent,
  PendingImpact,
} from '../types';
import { applyDelta, getMetric } from '../engine/metric-resolver';

// ============================================================
// IMPACT PIPELINE
// Takes fired GameEvents and applies their metric consequences
// to the world state — immediately for delay:0 impacts,
// or scheduled for future ticks otherwise.
//
// Decay is applied each tick to active pending impacts,
// modeling how event consequences fade over time unless
// reinforced by subsequent events.
// ============================================================

// ============================================================
// ID GENERATION
// ============================================================

function generateImpactId(eventId: string, metricPath: string): string {
  return `imp_${eventId}_${metricPath.replace('.', '_')}_${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================
// SCHEDULE IMPACTS
// Called immediately when an event fires.
// Splits impacts into immediate (delay 0) and pending (delay > 0).
// Returns updated WorldState.
// ============================================================

export function scheduleImpacts(
  state: WorldState,
  event: GameEvent
): WorldState {
  let updatedMetrics = state.metrics;
  const newPendingImpacts: PendingImpact[] = [...state.pendingImpacts];

  for (const impact of event.impacts) {
    if (impact.propagationDelay === 0) {
      // Apply immediately
      try {
        updatedMetrics = applyDelta(updatedMetrics, impact.metricPath, impact.delta);
        console.log(
          `[Impact] Immediate: ${impact.metricPath} ${impact.delta >= 0 ? '+' : ''}${impact.delta.toFixed(2)} ` +
          `→ ${getMetric(updatedMetrics, impact.metricPath).toFixed(1)}`
        );
      } catch (err) {
        console.warn(`[Impact] Failed to apply immediate impact: ${err}`);
      }
    } else {
      // Schedule for future tick
      const pendingImpact: PendingImpact = {
        id: generateImpactId(event.id, impact.metricPath),
        sourceEventId: event.id,
        metricPath: impact.metricPath,
        delta: impact.delta,
        decayRate: impact.decayRate,
        scheduledForTick: state.currentTick + impact.propagationDelay,
      };
      newPendingImpacts.push(pendingImpact);
      console.log(
        `[Impact] Scheduled: ${impact.metricPath} ${impact.delta >= 0 ? '+' : ''}${impact.delta.toFixed(2)} ` +
        `in ${impact.propagationDelay} tick(s) (tick ${pendingImpact.scheduledForTick})`
      );
    }
  }

  return {
    ...state,
    metrics: updatedMetrics,
    pendingImpacts: newPendingImpacts,
  };
}

// ============================================================
// PROCESS PENDING IMPACTS
// Called every tick. Applies any impacts that are now due
// and removes them from the pending queue.
// Also applies decay to impacts that are waiting.
// ============================================================

export function processPendingImpacts(state: WorldState): WorldState {
  const currentTick = state.currentTick;
  let updatedMetrics = state.metrics;
  const remainingImpacts: PendingImpact[] = [];

  for (const pending of state.pendingImpacts) {
    if (pending.scheduledForTick <= currentTick) {
      // Due — apply now
      if (Math.abs(pending.delta) < 0.05) {
        // Delta has decayed to negligible — discard silently
        continue;
      }

      try {
        updatedMetrics = applyDelta(updatedMetrics, pending.metricPath, pending.delta);
        console.log(
          `[Impact] Resolved: ${pending.metricPath} ${pending.delta >= 0 ? '+' : ''}${pending.delta.toFixed(2)} ` +
          `→ ${getMetric(updatedMetrics, pending.metricPath).toFixed(1)} ` +
          `(from ${pending.sourceEventId})`
        );
      } catch (err) {
        console.warn(`[Impact] Failed to apply pending impact: ${err}`);
      }
      // Do not retain — impact has been applied
    } else {
      // Not yet due — apply decay to the delta and retain
      const decayedDelta = pending.delta * (1 - pending.decayRate);
      remainingImpacts.push({
        ...pending,
        delta: decayedDelta,
      });
    }
  }

  return {
    ...state,
    metrics: updatedMetrics,
    pendingImpacts: remainingImpacts,
  };
}

// ============================================================
// MARK EVENT RESOLVED
// Updates the event's status in the active events list
// and records which template fired (for cooldown tracking).
// ============================================================

export function markEventResolved(
  state: WorldState,
  eventId: string
): WorldState {
  const updatedEvents = state.activeEvents.map(evt =>
    evt.id === eventId
      ? { ...evt, status: 'RESOLVED' as const }
      : evt
  );

  return {
    ...state,
    activeEvents: updatedEvents,
  };
}

// ============================================================
// UPDATE TEMPLATE COOLDOWN
// Records the tick an event template last fired.
// Called after an event is resolved.
// ============================================================

export function updateTemplateCooldown(
  state: WorldState,
  templateId: string
): WorldState {
  const template = state.eventTemplates[templateId];
  if (!template) return state;

  return {
    ...state,
    eventTemplates: {
      ...state.eventTemplates,
      [templateId]: {
        ...template,
        lastFiredTick: state.currentTick,
      },
    },
  };
}

// ============================================================
// SNAPSHOT
// Takes a snapshot of current metrics and appends to
// recentSnapshots. Trims to last 52 snapshots (one year).
// ============================================================

export function takeSnapshot(state: WorldState): WorldState {
  const snapshot = {
    tick: state.currentTick,
    metrics: state.metrics,
  };

  const updatedSnapshots = [
    ...state.recentSnapshots,
    snapshot,
  ].slice(-52);

  return {
    ...state,
    recentSnapshots: updatedSnapshots,
  };
}