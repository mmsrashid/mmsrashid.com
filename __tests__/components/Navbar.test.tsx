import { render, screen } from '@testing-library/react'
import Navbar from '@/components/Navbar'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('Navbar', () => {
  it('renders site name', () => {
    render(<Navbar />)
    expect(screen.getByText('MR')).toBeInTheDocument()
  })

  it('renders nav links', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /portfolio/i })).toHaveAttribute('href', '/portfolio')
    expect(screen.getByRole('link', { name: /cv/i })).toHaveAttribute('href', '/cv')
    expect(screen.getByRole('link', { name: /blog/i })).toHaveAttribute('href', '/blog')
  })
})
