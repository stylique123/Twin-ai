// Brand caption color resolution — pure, no database, no storage, no process.
//
// This is its own file rather than living in editorRenderStage.ts (where the
// resolution is actually USED) because that file imports db.ts, which
// requires SUPABASE_URL at module load — dragging any test that merely wants
// this one pure decision into needing a live database env to even import it.
// Splitting it out means it can be unit tested directly, matching the same
// reasoning editorCompile.ts's own header gives for refusing DB/network
// imports: a file that stays pure stays trivially testable.
export interface CaptionColourInputs {
  brandPrimaryColourAss: string | null
  brandHighlightColourAss: string | null
}
export interface CaptionColourPreset {
  primaryColourAss: string
  emphasisColourAss: string
}

/**
 * Brand color, if the owner has one pinned, wins over the catalog's generic
 * default. Highlight reuses the SAME brand color as primary when only the
 * primary is set, rather than mixing a real brand color with a generic
 * catalog accent that was never meant to sit next to it.
 */
export function resolveCaptionColours(
  captions: CaptionColourInputs,
  preset: CaptionColourPreset,
): { primaryColourAss: string; emphasisColourAss: string } {
  return {
    primaryColourAss: captions.brandPrimaryColourAss ?? preset.primaryColourAss,
    emphasisColourAss: captions.brandHighlightColourAss ?? captions.brandPrimaryColourAss ?? preset.emphasisColourAss,
  }
}
