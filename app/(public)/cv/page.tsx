export default function CVPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-start justify-between mb-12">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Mohammed Rashid</h1>
          <p className="text-gray-500">Mechanical &amp; Software Engineer</p>
        </div>
        <a
          href="/cv.pdf"
          download
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
        >
          Download PDF
        </a>
      </div>

      <section className="mb-12">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Experience</h2>
        <div className="space-y-8">
          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-gray-900">Software Engineer</h3>
                <span className="text-sm text-gray-400">2022 – Present</span>
              </div>
              <p className="text-sm text-gray-500 mb-1">Company Name</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Brief description of responsibilities and achievements.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Education</h2>
        <div className="flex gap-6">
          <div className="w-2 h-2 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-gray-900">MEng Mechanical Engineering</h3>
              <span className="text-sm text-gray-400">2017 – 2021</span>
            </div>
            <p className="text-sm text-gray-500">University Name</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {[
            'TypeScript', 'React', 'Next.js', 'Node.js', 'Python',
            'SQL', 'CAD', 'FEA', 'Project Management',
          ].map((skill) => (
            <span key={skill} className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
