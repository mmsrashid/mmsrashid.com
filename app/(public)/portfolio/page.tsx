import { createClient } from '@/lib/supabase/server'
import ProjectCard from '@/components/ProjectCard'
import type { Project } from '@/lib/types'

export const revalidate = 60

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Work</h1>
      <p className="text-gray-500 mb-12">Products and platforms I've built or led — across health tech, AI, travel, and media.</p>

      {!projects?.length ? (
        <p className="text-gray-400">Projects coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project: Project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
