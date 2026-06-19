export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-8 mt-24">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
        <span>© {new Date().getFullYear()} Mohammed Rashid</span>
        <div className="flex gap-6">
          <a
            href="https://linkedin.com/in/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}
