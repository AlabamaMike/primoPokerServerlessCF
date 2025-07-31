import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PokerCard, CardPlaceholder } from '@/components/poker/Card'
import { Card, Suit, Rank } from '@primo-poker/shared'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>
  }
}))

describe('PokerCard', () => {
  const mockCard: Card = {
    suit: Suit.HEARTS,
    rank: Rank.ACE
  }

  test('renders card with correct suit and rank', () => {
    render(<PokerCard card={mockCard} />)
    
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('♥')).toBeInTheDocument()
  })

  test('renders hidden card when isHidden is true', () => {
    render(<PokerCard card={mockCard} isHidden={true} />)
    
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    expect(screen.getByText('🂠')).toBeInTheDocument()
  })

  test('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<PokerCard card={mockCard} onClick={handleClick} />)
    
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  test('applies correct size classes', () => {
    const { rerender } = render(<PokerCard card={mockCard} size="sm" />)
    expect(screen.getByRole('button')).toHaveClass('w-12', 'h-16', 'text-xs')

    rerender(<PokerCard card={mockCard} size="lg" />)
    expect(screen.getByRole('button')).toHaveClass('w-20', 'h-28', 'text-base')
  })

  test('applies red color for hearts and diamonds', () => {
    const { rerender } = render(<PokerCard card={{ suit: Suit.HEARTS, rank: Rank.ACE }} />)
    expect(screen.getAllByText('♥')[0]).toHaveClass('text-red-600')

    rerender(<PokerCard card={{ suit: Suit.DIAMONDS, rank: Rank.KING }} />)
    expect(screen.getAllByText('♦')[0]).toHaveClass('text-red-600')
  })

  test('applies black color for clubs and spades', () => {
    const { rerender } = render(<PokerCard card={{ suit: Suit.CLUBS, rank: Rank.ACE }} />)
    expect(screen.getAllByText('♣')[0]).toHaveClass('text-black')

    rerender(<PokerCard card={{ suit: Suit.SPADES, rank: Rank.KING }} />)
    expect(screen.getAllByText('♠')[0]).toHaveClass('text-black')
  })
})

describe('CardPlaceholder', () => {
  test('renders placeholder with question mark', () => {
    render(<CardPlaceholder />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  test('applies correct size classes', () => {
    const { rerender } = render(<CardPlaceholder size="sm" />)
    expect(screen.getByText('?').parentElement).toHaveClass('w-12', 'h-16', 'text-xs')

    rerender(<CardPlaceholder size="lg" />)
    expect(screen.getByText('?').parentElement).toHaveClass('w-20', 'h-28', 'text-base')
  })
})
