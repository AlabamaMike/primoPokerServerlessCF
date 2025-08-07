import { formatCurrency, parseCurrency, formatBigBlind, getCurrencySymbol } from '../currency';

describe('currency utilities', () => {
  describe('formatCurrency', () => {
    it('should format USD correctly', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('should format EUR correctly', () => {
      expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56');
    });

    it('should format GBP correctly', () => {
      expect(formatCurrency(1234.56, 'GBP')).toBe('£1,234.56');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle negative numbers', () => {
      expect(formatCurrency(-100)).toBe('-$100.00');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
    });

    it('should handle decimal precision', () => {
      expect(formatCurrency(10.999)).toBe('$11.00');
      expect(formatCurrency(10.001)).toBe('$10.00');
    });

    it('should support custom locale', () => {
      expect(formatCurrency(1234.56, 'EUR', 'de-DE')).toBe('1.234,56 €');
    });
  });

  describe('parseCurrency', () => {
    it('should parse valid currency strings', () => {
      expect(parseCurrency('$100.50')).toBe(100.50);
      expect(parseCurrency('€100.50')).toBe(100.50);
      expect(parseCurrency('£100.50')).toBe(100.50);
    });

    it('should handle strings without currency symbols', () => {
      expect(parseCurrency('100.50')).toBe(100.50);
      expect(parseCurrency('1,234.56')).toBe(1234.56);
    });

    it('should handle negative values', () => {
      expect(parseCurrency('-$100.50')).toBe(-100.50);
      expect(parseCurrency('$-100.50')).toBe(-100.50);
    });

    it('should return 0 for invalid input', () => {
      expect(parseCurrency('')).toBe(0);
      expect(parseCurrency('abc')).toBe(0);
      expect(parseCurrency('$')).toBe(0);
    });

    it('should handle spaces', () => {
      expect(parseCurrency('$ 100.50')).toBe(100.50);
      expect(parseCurrency('100.50 €')).toBe(100.50);
    });
  });

  describe('formatBigBlind', () => {
    it('should format big blind amounts correctly', () => {
      expect(formatBigBlind(100, 2)).toBe('50 BBs');
      expect(formatBigBlind(200, 2)).toBe('100 BBs');
      expect(formatBigBlind(50, 2)).toBe('25 BBs');
    });

    it('should handle fractional big blinds', () => {
      expect(formatBigBlind(5, 2)).toBe('2.5 BBs');
      expect(formatBigBlind(3, 2)).toBe('1.5 BBs');
    });

    it('should handle single big blind', () => {
      expect(formatBigBlind(2, 2)).toBe('1 BB');
    });

    it('should handle zero', () => {
      expect(formatBigBlind(0, 2)).toBe('0 BBs');
    });

    it('should work with different big blind values', () => {
      expect(formatBigBlind(500, 5)).toBe('100 BBs');
      expect(formatBigBlind(500, 10)).toBe('50 BBs');
    });
  });

  describe('getCurrencySymbol', () => {
    it('should return correct symbols', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('EUR')).toBe('€');
      expect(getCurrencySymbol('GBP')).toBe('£');
      expect(getCurrencySymbol('JPY')).toBe('¥');
    });

    it('should return currency code for unknown currencies', () => {
      expect(getCurrencySymbol('XYZ')).toBe('XYZ');
    });

    it('should handle case insensitive input', () => {
      expect(getCurrencySymbol('usd')).toBe('$');
      expect(getCurrencySymbol('eur')).toBe('€');
    });
  });
});