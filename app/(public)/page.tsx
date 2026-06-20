import Link from 'next/link'

const WORK = [
  {
    label: 'Longevity Flywheel',
    meta: 'Dr Tim Pearce · 2024–present',
    problem: 'A high-quality longevity clinic with no scalable product layer — every patient interaction was manual, one-to-one, and hard to grow.',
    outcome: 'Built the product layer: a B2B2C Flutter app, e-learning academy, and AI companion. Scaled to £100k MRR and £500k/month in e-commerce alongside a £1M+ webinar programme.',
    tags: ['Health Tech', 'AI', 'B2B2C', 'Flutter'],
  },
  {
    label: 'Patient AI Companion & Clinician Co-Pilot',
    meta: 'Dual-agent system',
    problem: 'Clinicians couldn\'t monitor patient progress between appointments. Dosage decisions were made on sparse, subjective data — and documentation ate hours of clinical time.',
    outcome: 'Two products shipped in parallel. Patients get a companion that tracks mood and wearable data. Clinicians get structured impact insights and automated notes — cutting admin and improving dosage accuracy.',
    tags: ['LLM/RAG', 'Wearables', 'Clinical Workflow'],
  },
  {
    label: 'OpenAI Treatment Plan Engine',
    meta: 'Twoth · 2022',
    problem: 'Dentists at a 6-surgery specialist clinic spent 30–40 minutes per patient manually drafting treatment plans. This bottlenecked capacity and introduced inconsistency.',
    outcome: 'Shipped an OpenAI-powered engine that generates personalised plans from intake data. Cut documentation time to under 5 minutes. Patient conversion increased 35%.',
    tags: ['OpenAI', 'Automation', 'Clinical Ops'],
  },
  {
    label: 'TROLLII',
    meta: 'Founder',
    problem: 'Travel agents had no affordable, API-first way to search and book across multiple hotel inventory sources in one place.',
    outcome: 'Architected a B2B2C booking engine on AWS/Node.js connected to 60,000+ hotels via live feeds. Built to handle real-time pricing, availability, and booking at scale.',
    tags: ['SaaS', 'API Integration', 'AWS'],
  },
]

const HOW_I_WORK = [
  {
    title: 'Start with the problem, not the solution',
    body: 'I spend more time than most on diagnosis — user interviews, data, stakeholder context — before I let a solution anywhere near a roadmap. The best features I\'ve cut are the ones I was most excited about.',
  },
  {
    title: 'Own the outcome, not the output',
    body: 'Shipped features aren\'t success. I track what changes for the user after launch and use that to decide what\'s next. My product decisions are always tied back to a metric I can defend.',
  },
  {
    title: 'Work at the intersection of commercial and technical',
    body: 'I can read a P&L and sit in a sprint planning meeting. That range means I can make faster decisions and translate cleanly between engineering, design, and leadership.',
  },
  {
    title: 'Ship, learn, adjust — fast',
    body: 'I bias toward getting something real in front of users quickly. Prototypes over decks, MVPs over roadmaps. I\'ve scaled products from zero using this approach more than once.',
  },
]

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20">

      {/* Hero */}
      <div className="max-w-2xl mb-24">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-5">Senior Product Manager · London</p>
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6 leading-tight">
          Mohammed Rashid
        </h1>
        <p className="text-lg text-gray-600 mb-4 leading-relaxed">
          I own products end to end — from identifying the problem to shipping the solution to measuring what changes.
        </p>
        <p className="text-lg text-gray-600 mb-10 leading-relaxed">
          Background in engineering (MEng, UCL). Currently Head of Product at{' '}
          <a href="https://drtimpearce.com" target="_blank" rel="noopener noreferrer" className="text-gray-900 underline underline-offset-2 hover:no-underline">Dr Tim Pearce</a>
          , building AI health products. Previously scaled a clinic from £0 to £1.2M and built a travel SaaS from scratch.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/portfolio"
            className="inline-flex items-center px-5 py-2.5 bg-gray-900 text-white text-sm rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            See my work
          </Link>
          <Link
            href="/cv"
            className="inline-flex items-center px-5 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            CV
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
      <div className="mb-24">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-8">Selected work</h2>
        <div className="space-y-4">
          {WORK.map((w) => (
            <div key={w.label} className="border border-gray-200 rounded-xl p-6 hover:border-gray-400 transition-colors">
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-base font-semibold text-gray-900">{w.label}</h3>
                <span className="text-xs text-gray-400">{w.meta}</span>
              </div>
              <p className="text-sm text-gray-500 mb-1"><span className="font-medium text-gray-700">Problem:</span> {w.problem}</p>
              <p className="text-sm text-gray-600 mb-4"><span className="font-medium text-gray-900">What changed:</span> {w.outcome}</p>
              <div className="flex flex-wrap gap-1.5">
                {w.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href="/portfolio" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Full portfolio →
          </Link>
        </div>
      </div>

      {/* How I work */}
      <div className="mb-20">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-8">How I work</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {HOW_I_WORK.map((h) => (
            <div key={h.title}>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{h.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{h.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer nudge */}
      <div className="pt-10 border-t border-gray-100">
        <p className="text-sm text-gray-500">
          Open to Senior PM roles in London.{' '}
          <a href="mailto:m@mrashid.co" className="text-gray-900 underline underline-offset-2 hover:no-underline">Get in touch</a>
          {' '}or{' '}
          <Link href="/cv" className="text-gray-900 underline underline-offset-2 hover:no-underline">read my CV</Link>.
        </p>
      </div>

    </div>
  )
}
