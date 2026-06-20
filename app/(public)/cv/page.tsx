export default function CVPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Mohammed Rashid</h1>
          <p className="text-gray-500">Senior Product Manager · London</p>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
            <span>London</span>
            <a href="mailto:m@mrashid.co" className="hover:text-gray-900">m@mrashid.co</a>
            <a href="tel:+447738234529" className="hover:text-gray-900">+44 7738 234529</a>
            <a href="https://www.linkedin.com/in/mmsrashid/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900">LinkedIn</a>
          </div>
        </div>
        <a
          href="/cv.pdf"
          download
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors flex-shrink-0"
        >
          Download PDF
        </a>
      </div>

      {/* Executive Summary */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">Executive Summary</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Product Manager with an engineering background (MEng, UCL) and a track record of shipping in high-stakes, fast-moving environments. I've taken products from zero — a clinic scaled to £1.2M, a health platform to £100k MRR, an AI system that cut clinical admin by 80%. I work across the full product surface: discovery, roadmap, engineering, commercial. Strongest in products where technical depth and user empathy both matter.
        </p>
      </section>

      {/* Core Competencies */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">Core Competencies</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p><span className="font-medium text-gray-800">AI &amp; Product Strategy:</span> LLM/RAG Architecture, Precision Medicine Protocols, B2B2C Ecosystems.</p>
          <p><span className="font-medium text-gray-800">Growth Engineering:</span> £2M+ Annual Paid Media Oversight, 30% LTV Uplift, PLG Flywheels.</p>
          <p><span className="font-medium text-gray-800">Technical Leadership:</span> Managed global teams (30+), Flutter, Python, AWS/GCP, Wearable APIs.</p>
        </div>
      </section>

      {/* Professional Experience */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Professional Experience</h2>
        <div className="space-y-8">

          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-900 mt-1.5 flex-shrink-0" />
            <div>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-gray-900">Head of Tech &amp; Product</h3>
                <span className="text-sm text-gray-400">2024 – Present</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">Dr Tim Pearce Ltd (Profinity Group)</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Engineered a "Longevity Flywheel" integrating a physical clinic, B2B2C Flutter app, and e-learning academy generating £100k MRR.</li>
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Delivered £500k/month in e-commerce sales and executed multiple £1M+ webinar launches via a data-driven £2M+ annual paid strategy.</li>
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Launched a Patient AI Companion (wearable tracking) and a Clinician AI Co-Pilot (impact insights) to optimize GLP-1/HRT dosages through sentiment/mood tracking.</li>
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Created a pipeline transforming clinical RWE into accredited digital courses for 1,000+ medical professionals.</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
            <div>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-gray-900">Head of Sales &amp; Product</h3>
                <span className="text-sm text-gray-400">2021 – 2024</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">Twoth (Specialist Medical)</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Architected and built a 6-surgery medical clinic from scratch, managing end-to-end technical, physical, and operational rollout.</li>
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Prototyped an OpenAI-powered treatment plan engine, automating clinical documentation and increasing patient conversion by 35%.</li>
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Scaled revenue from £0 to £1.2M in 24 months by integrating automated sales funnels with high-touch clinical excellence.</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
            <div>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-gray-900">Head of Tech &amp; Commercial Scaling</h3>
                <span className="text-sm text-gray-400">2017 – 2021</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">Major Travel (Global B2B2C)</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Managed integration of 40+ global travel API feeds, processing £500k/month in automated revenue with 99.9% uptime.</li>
                <li className="flex gap-2"><span className="text-gray-300 flex-shrink-0">—</span>Scaled international operations from 6 to 30 personnel across three global sites.</li>
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* Ventures */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Ventures &amp; Side Quests</h2>
        <div className="space-y-4 text-sm text-gray-600">
          <div><span className="font-medium text-gray-800">TROLLII (Founder):</span> B2B2C travel SaaS. Architected AWS/NodeJS booking engine for 60k+ hotels.</div>
          <div><span className="font-medium text-gray-800">STAMPED (Founder):</span> Scaled digital community to 1M+ followers and 50M+ annual organic views through algorithmic content strategy. Zero paid spend.</div>
        </div>
      </section>

      {/* Education */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Education</h2>
        <div className="space-y-4">
          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900">MEng Mechanical Engineering</h3>
              <p className="text-sm text-gray-500">University College London (UCL)</p>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900">MA Philosophy of Education</h3>
              <p className="text-sm text-gray-500">University College London (UCL)</p>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900">Full-Stack Certification</h3>
              <p className="text-sm text-gray-500">Le Wagon</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stack */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">Stack</h2>
        <div className="flex flex-wrap gap-2">
          {['Python', 'Flutter', 'NodeJS', 'LLM/RAG', 'AWS', 'GCP', 'SQL'].map((skill) => (
            <span key={skill} className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
