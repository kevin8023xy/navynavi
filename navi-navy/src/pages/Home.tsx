import { useState, useEffect } from 'react'
import { Ship, Anchor } from 'lucide-react'
import { Link } from 'react-router-dom'

const NAV_ITEMS = [
  {
    title: 'Client Portal',
    description: 'Access vessel tracking and maritime information',
    href: '/client',
    icon: Ship,
  },
  {
    title: 'Console',
    description: 'Manage and monitor VTS operations',
    href: '/console',
    icon: Anchor,
  },
] as const

function WaveParticles() {
  const [particles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 6 + 2,
      duration: Math.random() * 15 + 10,
      delay: Math.random() * 15,
    }))
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="wave-particle"
          style={{
            left: `${p.left}%`,
            bottom: '-10px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

function NavCard({ title, description, href, icon: Icon }: typeof NAV_ITEMS[number]) {
  return (
    <Link
      to={href}
      className="glass-card group block p-8 rounded-2xl text-center no-underline"
    >
      <div className="flex justify-center mb-4">
        <Icon className="icon-glow w-16 h-16 text-blue-300" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl font-semibold mb-2 text-white">{title}</h2>
      <p className="text-blue-200 text-sm leading-relaxed">{description}</p>
    </Link>
  )
}

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="ocean-bg min-h-screen relative flex flex-col">
      <WaveParticles />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 relative z-10">
        <header
          className={`text-center mb-16 transition-all duration-1000 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Anchor className="w-10 h-10 text-blue-400" strokeWidth={1.5} />
            <h1 className="text-5xl md:text-7xl font-bold text-white glow-text tracking-tight">
              NavyNavi
            </h1>
          </div>
          <p className="text-blue-300 text-lg tracking-widest uppercase">
            Vessel Traffic Management System
          </p>
          <div className="mt-4 inline-block bg-blue-500/20 text-blue-200 text-xs px-3 py-1 rounded-full border border-blue-400/30">
            Version 0.6.2
          </div>
        </header>

        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full transition-all duration-1000 delay-300 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {NAV_ITEMS.map((item) => (
            <NavCard key={item.title} {...item} />
          ))}
        </div>
      </main>

      <footer className="mt-8 md:mt-24 text-center text-sm text-blue-200/70 pb-8 relative z-10">
        <p>Copyright &copy; 2024-2026 NavyNavi Team. All rights reserved.</p>
      </footer>
    </div>
  )
}
