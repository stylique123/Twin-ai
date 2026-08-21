// WRITING DOWN WHY A REFERENCE WENT WHERE IT WENT.
//
// ⚖️ BEST EFFORT, EXACTLY LIKE recordRenderAttempt. This row is a diagnostic
// about a decision, not the decision itself. A drift record that could fail an
// assessment would make the instrument more dangerous than the defect it was
// built to find — and the defect it finds is that we routed 7 of 40 references
// on stale metadata.
//
// ⚠️ WHICH IS THE OPPOSITE RULE TO extraction_replication, where the row IS the
// deliverable and a failed write throws. The difference is what the caller is
// for: a replication that stored nothing did not happen; an assessment that
// stored no drift record still assessed the reference correctly.

import { db } from './db.js'
import type { RoutingMeasurement } from './transcriptRouting.js'

export async function recordRoutingDecision(m: RoutingMeasurement): Promise<void> {
  try {
    const { error } = await db.from('transcript_routing_decisions').insert({
      url: m.url,
      platform: m.platform,
      download_route: m.downloadRoute,
      source: m.source,
      stored_chars: m.storedChars,
      actual_chars: m.actualChars,
      delta_chars: m.deltaChars,
      // ⚖️ ROUNDED AT THE BOUNDARY, not left to the driver's float formatting.
      // numeric(10,4) would reject a long float, and losing the row over a
      // rendering detail would be an absurd way to lose a measurement.
      ratio: m.ratio === null ? null : Number(m.ratio.toFixed(4)),
      routing_decision: m.routingDecision,
      threshold_chars: m.thresholdChars,
    })
    if (error) {
      console.log(JSON.stringify({
        event: 'routing_decision_not_recorded', url: m.url, reason: error.message,
      }))
    }
  } catch (e) {
    // ⚠️ SWALLOWED ON PURPOSE, AND SAID OUT LOUD. Silence here would make a
    // missing row indistinguishable from a reference nobody measured.
    console.log(JSON.stringify({
      event: 'routing_decision_not_recorded', url: m.url,
      reason: e instanceof Error ? e.message : String(e),
    }))
  }
}
