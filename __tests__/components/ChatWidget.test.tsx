import { render, screen, fireEvent } from '@testing-library/react'
import ChatWidget from '@/components/ChatWidget'

describe('ChatWidget', () => {
  it('renders the chat button', () => {
    render(<ChatWidget />)
    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument()
  })

  it('opens the panel when chat button is clicked', () => {
    render(<ChatWidget />)
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /chat/i }))
    expect(screen.getByRole('form')).toBeInTheDocument()
  })

  it('shows name, email, message fields in the form', () => {
    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /chat/i }))
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/your email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/your message/i)).toBeInTheDocument()
  })
})
