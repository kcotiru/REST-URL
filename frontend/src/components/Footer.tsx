import { Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center 
      justify-between gap-6"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 
          flex items-center justify-center"
          >
            <Zap className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="font-display font-semibold text-text-primary">
            REST <span className="text-accent">URL</span>
          </span>
        </div>

        <nav className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm text-text-muted font-body">
          {[['/', 'Home'], ['/pricing', 'Pricing'], ['/dashboard', 'Dashboard'], ['/keys', 'API keys'], ['/billing', 'Billing']].map(([to, label]) => (
            <Link key={to} to={to} className="hover:text-text-secondary transition-colors">
              {label}
            </Link>
          ))}
        </nav>

        <p className="text-xs text-text-muted font-mono">
          © {new Date().getFullYear()} REST URL — All rights reserved
        </p>
      </div>
    </footer>
  )
}
