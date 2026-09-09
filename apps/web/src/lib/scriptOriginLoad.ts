// THE PRODUCT THIS SCRIPT WAS BUILT ABOUT, READ BACK AFTERWARDS.
//
// ⚠️ THE AGENCY NEEDS IT BEFORE FORWARDING: "I need to know which product each
// script used, or I'll send a client the wrong one." `generations` does not
// carry the choice — `generation_choices` does (0137), and nothing has ever
// read it back onto the finished script.
//
// ⚖️ TWO READS RATHER THAN A JOIN, because RLS is per-table and a join through
// PostgREST would need an embedded resource whose policy is a second thing to
// keep right. Both tables already restrict to the owner.
//
// ⚠️ A FAILED READ IS SILENCE, NEVER A GUESS. If the choice row is missing —
// every generation before 0137 has none — the panel shows the source line alone
// rather than inventing a product or claiming there was none. "We do not know"
// and "there was no product" are different, and only the second would be a
// statement about the video.
import { supabase } from './supabase'
import type { EntityRelationship, PersonalUse } from '@twinai/shared'

export interface ScriptProduct {
  name: string | null
  relationship: EntityRelationship
  personalUse: PersonalUse
}

export async function loadScriptProduct(generationId: string): Promise<ScriptProduct | null> {
  try {
    const { data: choice, error: e1 } = await supabase
      .from('generation_choices')
      .select('selected_product_id')
      .eq('generation_id', generationId)
      .maybeSingle()
    if (e1 || !choice) return null
    const id = (choice as { selected_product_id?: string | null }).selected_product_id
    if (!id) return null

    const { data: ent, error: e2 } = await supabase
      .from('product_entities')
      .select('name, relationship, personal_use')
      .eq('id', id)
      .maybeSingle()
    if (e2 || !ent) return null
    const e = ent as { name?: string | null; relationship?: string; personal_use?: string }
    // ⚠️ THE NULL CHECK PRECEDES THE COERCION. A row missing `relationship`
    // would otherwise become the string "undefined" and reach `claimRulesFor`,
    // which would fall through to its most permissive branch — the one case
    // where a missing value must not be treated as an answer.
    if (typeof e.relationship !== 'string' || e.relationship === '') return null
    return {
      name: e.name ?? null,
      relationship: e.relationship as EntityRelationship,
      personalUse: (typeof e.personal_use === 'string' && e.personal_use !== ''
        ? e.personal_use : 'NOT_CONFIRMED') as PersonalUse,
    }
  } catch {
    return null
  }
}
