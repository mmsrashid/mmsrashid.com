import { render, screen } from '@testing-library/react'
import ProjectCard from '@/components/ProjectCard'
import type { Project } from '@/lib/types'

const mockProject: Project = {
  id: '1',
  title: 'Test Project',
  description: 'A test project description',
  tags: ['React', 'TypeScript'],
  github_url: 'https://github.com/test/repo',
  live_url: null,
  created_at: '2026-01-01',
}

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('ProjectCard', () => {
  it('renders project title and description', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
    expect(screen.getByText('A test project description')).toBeInTheDocument()
  })

  it('renders tech tags', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('renders GitHub link when present', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/test/repo',
    )
  })

  it('does not render live link when absent', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.queryByRole('link', { name: /live/i })).not.toBeInTheDocument()
  })
})
