import Link from 'next/link'

const HIGHLIGHTS = [
  {
    label: 'Longevity Flywheel',
    meta: 'Dr Tim Pearce · 2024–present',
    desc: 'Built a vertically integrated health ecosystem — clinic, Flutter app, and e-learning academy — scaling to £100k MRR and £500k/month in e-commerce.',
    tags: ['Flutter', 'LLM', 'AWS'],
  },
  {
    label: 'Dual AI Agent System',
    meta: 'Patient Companion + Clinician Co-Pilot',
    desc: 'Shipped two AI products in parallel: a patient-facing companion that tracks wearable data to optimise GLP-1/HRT dosing, and a clinician tool that surfaces impact insights and automates documentation.',
    tags: ['LLM/RAG', 'Python', 'Wearables'],
  },
  {
    label: 'OpenAI Treatment Plan Engine',
    meta: 'Twoth · 2022',
    desc: 'Prototyped an OpenAI-powered engine that generates personalised treatment plans from intake data. Automated clinical documentation end-to-end and increased patient conversion by 35%.',
    tags: ['OpenAI', 'Python', 'NodeJS'],
  },
  {
    label: 'TROLLII',
    meta: 'Founder',
    desc: 'B2B2C travel SaaS. Architected a booking engine on AWS and Node.js with live connectivity to 60,000+ hotels — handling real-time inventory, pricing, and availability at scale.',
    tags: ['AWS', 'NodeJS', 'SQL'],
  },
]

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">

      {/* Hero */}
      <div className="max-w-2xl mb-20">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-4">
          Mohammed Rashid
        </h1>
        <p className="text-xl text-gray-500 mb-6">
          Product &amp; Engineering Leader
        </p>
        <p className="text-lg text-gray-600 mb-10 leading-relaxed">
          I build systems that move fast and scale. MEng from UCL,
          currently Head of Tech &amp; Product at{' '}
          <a href="https://drtimpearce.com" target="_blank" rel="noopener noreferrer" className="text-gray-900 underline underline-offset-2">Dr Tim Pearce</a>
          {' '}— shipping AI products, health platforms, and the infrastructure behind them.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/portfolio"
            className="inline-flex items-center px-5 py-2.5 bg-gray-900 text-white text-sm rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            View my work
          </Link>
          <Link
            href="/cv"
            className="inline-flex items-center px-5 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            Read CV
          </Link>
          <a
            href="https://www.linkedin.com/in/mmsrashid/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-5 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-5 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>

      {/* Selected work */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6">Selected work</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HIGHLIGHTS.map((h) => (
            <div key={h.label} className="border border-gray-200 rounded-xl p-5 hover:border-gray-400 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">{h.label}</h3>
                <span className="text-xs text-gray-400 ml-4 shrink-0">{h.meta}</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">{h.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {h.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href="/portfolio" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            See all projects →
          </Link>
        </div>
      </div>

      {/* Currently */}
      <div className="mt-20 pt-10 border-t border-gray-100">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Currently</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>→ Head of Tech &amp; Product at <a href="https://drtimpearce.com" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:underline">Dr Tim Pearce Ltd</a> — building AI health products at scale.</p>
          <p>→ Building <a href="https://github.com/mmsrashid" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:underline">personal tooling</a> in Next.js + Supabase.</p>
        </div>
      </div>

    </div>
  )
}
