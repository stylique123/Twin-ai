import { Link, useNavigate } from 'react-router-dom'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'
import { videosFromCredits } from '../lib/brand'

export function Nav() {
  const { session, profile, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to={session ? '/app' : '/'}>
          <Logo />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {session ? (
            <>
              {profile && (
                <span className="chip" title="Recreations left">
                  {videosFromCredits(profile.credits)} left
                </span>
              )}
              <Link to="/app" className="text-sand hover:text-cream">
                Studio
              </Link>
              <Link to="/history" className="text-sand hover:text-cream">
                History
              </Link>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await signOut()
                  navigate('/')
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a href="/#how" className="text-sand hover:text-cream">
                How it works
              </a>
              <a href="/#pricing" className="text-sand hover:text-cream">
                Pricing
              </a>
              <Link to="/auth" className="btn-primary">
                Start free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
