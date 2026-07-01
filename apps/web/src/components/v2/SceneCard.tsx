// Renders one Scene from the Scene Timeline in plain creator language. Used on
// the Plan screen (read + change) and the Capture/teleprompter screen. Never
// shows filmmaking jargon — the scene already carries creator-friendly text.
import type { Scene } from '../../lib/timeline'
import { Card } from './Primitives'

const TYPE_LABEL: Record<Scene['scene_type'], string> = {
  talking_head: 'You talk',
  b_roll: 'Show this while talking',
  screen_recording: 'Screen recording',
  product_demo: 'Show the product',
  cta: 'Final action',
}

export default function SceneCard({ scene, onChange }: { scene: Scene; onChange?: () => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-sand/70">
          Scene {scene.scene_number} · {TYPE_LABEL[scene.scene_type]}
        </span>
        <span className="text-xs text-sand/50">{scene.duration_sec.toFixed(1)}s</span>
      </div>

      {scene.dialogue ? (
        <p className="text-cream leading-snug">{scene.dialogue}</p>
      ) : (
        <p className="text-sand/70 italic leading-snug">{scene.broll_instruction || 'Visual moment — no talking'}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tag>{scene.camera_framing}</Tag>
        {scene.broll_instruction && scene.dialogue && <Tag>Show this while talking</Tag>}
        {scene.caption_text && <Tag>Caption: “{scene.caption_text}”</Tag>}
      </div>

      {onChange && (
        <button onClick={onChange} className="mt-3 text-sm font-medium text-sand hover:text-cream underline underline-offset-2">
          Change this scene
        </button>
      )}
    </Card>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] rounded-full bg-white/10 text-sand px-2 py-0.5">{children}</span>
}
