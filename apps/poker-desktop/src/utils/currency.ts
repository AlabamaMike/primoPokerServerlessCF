export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function parseCurrency(value: string): number {
  // Remove currency symbols and spaces
  const cleanedValue = value
    .replace(/[€£¥$]/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '');
  
  const parsed = parseFloat(cleanedValue);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatBigBlind(amount: number, bigBlindValue: number): string {
  if (bigBlindValue === 0) return '0 BBs';
  
  const bbs = amount / bigBlindValue;
  const formatted = bbs % 1 === 0 ? bbs.toString() : bbs.toFixed(1);
  
  return bbs === 1 ? '1 BB' : `${formatted} BBs`;
}

export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: '$',
    AUD: '$',
    CHF: 'CHF',
    CNY: '¥',
    SEK: 'kr',
    NZD: '$'
  };
  
  return symbols[currency.toUpperCase()] || currency.toUpperCase();
}