import { useState, useEffect } from 'react'
import { Ship, Anchor } from 'lucide-react'
import { Link } from 'react-router-dom'
import bgImage from '../assets/bg.jpg'
import logoImage from '../assets/logo.webp'

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

function NavCard({ title, description, href, icon: Icon }: typeof NAV_ITEMS[number]) {
  return (
    <Link
      to={href}
      className="group block p-8 rounded-2xl bg-white/10 backdrop-blur-lg border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105 no-underline"
    >
      <Icon className="w-16 h-16 mb-4 text-blue-300 group-hover:text-blue-200" strokeWidth={1.5} />
      <h2 className="text-2xl font-semibold mb-2 text-white">{title}</h2>
      <p className="text-blue-200">{description}</p>
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
    <main className="min-h-screen bg-linear-to-br from-blue-950 via-blue-700 to-blue-500 flex items-center justify-center p-4 relative">
      {/* Background image — faint overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${bgImage})` }}
      />

      {/* Content */}
      <div
        className={`relative z-10 w-full max-w-6xl mx-auto text-white transition-all duration-1000 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <header className="flex flex-col items-center text-center my-8 md:my-32">
          <img
            alt="NavyNavi"
            src={logoImage}
            width={128}
            height={128}
            className="mb-8"
          />
          <h1 className="font-heading text-3xl md:text-5xl font-bold mb-4 tracking-wide">NavyNavi</h1>
          <p className="text-base text-blue-200">Version 0.6.2</p>
        </header>

        <div className="grid md:grid-cols-2 gap-8 mx-6">
          {NAV_ITEMS.map((item) => (
            <NavCard key={item.title} {...item} />
          ))}
        </div>

        <footer className="mt-8 md:mt-24 text-center text-sm text-blue-200">
          <p>Copyright &copy; 2024-2026 NavyNavi Team. All rights reserved.</p>
        </footer>
      </div>
    </main>
  )
}
