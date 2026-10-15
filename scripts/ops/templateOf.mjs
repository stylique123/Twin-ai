// Which script template a blueprint used (panel-current-3 item g): the
// template record's id, or 'none'. Mirrors templateIdOf in
// packages/shared/src/script/templates/scriptTemplates.ts.
export function templateOf(bp) {
  const id = bp?.template?.id
  return typeof id === 'string' && id.trim() ? id : 'none'
}
