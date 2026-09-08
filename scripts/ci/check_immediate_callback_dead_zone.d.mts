// ⚠️ A TYPED SURFACE FOR A GUARD THE TESTS IMPORT. Without this the test file
// pulls in an implicit `any` and `check_test_typecheck_ratchet` fails — which
// it should: an untyped import is how a test starts asserting against a shape
// nobody checks. Excluding the test from the ratchet would have been the wrong
// fix; declaring the contract is the right one.
export interface ImmediateCallbackDeadZone {
  /** The identifier read before it exists. */
  name: string
  /** 1-based line of the READ. */
  line: number
  /** 1-based line of the declaration that has not run yet. */
  declaredOnLine: number
  /** The array method whose callback runs during the call. */
  method: string
}

export function findImmediateCallbackDeadZones(
  source: string,
  fileLabel?: string,
): ImmediateCallbackDeadZone[]
