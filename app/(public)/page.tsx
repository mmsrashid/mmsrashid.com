import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24">
      <div className="max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-4">
          Mohammed Rashid
        </h1>
        <p className="text-xl text-gray-500 mb-8">
          Mechanical &amp; Software Engineer
        </p>
        <p className="text-lg text-gray-600 mb-12 leading-relaxed">
          I build software that solves real problems. MEng in Mechanical Engineering,
          working in software. Based in the UK.
        </p>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/portfolio"
            className="inline-flex items-center px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            View my work
          </Link>
          <Link
            href="/cv"
            className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            Download CV
          </Link>
          <a
            href="https://linkedin.com/in/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
