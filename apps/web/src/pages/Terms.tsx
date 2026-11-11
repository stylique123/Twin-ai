import LegalPage from './LegalPage'
import { TERMS } from '../content/legal/terms'

export default function Terms() {
  return <LegalPage doc={TERMS} kind="terms" />
}
