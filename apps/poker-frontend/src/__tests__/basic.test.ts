// Simple test to verify test framework works
describe('Basic test suite', () => {
  test('should pass basic math test', () => {
    expect(2 + 2).toBe(4)
  })

  test('should handle string operations', () => {
    expect('Primo'.toLowerCase()).toBe('primo')
  })

  test('should work with arrays', () => {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades']
    expect(suits).toHaveLength(4)
    expect(suits).toContain('hearts')
  })
})
