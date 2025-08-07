import { parseCommand, getCommandSuggestions, validateBetAmount, formatCommandHelp } from '../utils/chatCommands';

describe('chatCommands', () => {
  describe('parseCommand', () => {
    it('parses simple commands', () => {
      expect(parseCommand('/fold')).toEqual({ command: 'fold', args: [] });
      expect(parseCommand('/check')).toEqual({ command: 'check', args: [] });
      expect(parseCommand('/call')).toEqual({ command: 'call', args: [] });
    });

    it('parses commands with arguments', () => {
      expect(parseCommand('/bet 100')).toEqual({ command: 'bet', args: ['100'] });
      expect(parseCommand('/raise 250')).toEqual({ command: 'raise', args: ['250'] });
      expect(parseCommand('/mute Alice')).toEqual({ command: 'mute', args: ['Alice'] });
    });

    it('handles multiple arguments', () => {
      expect(parseCommand('/bet 100 extra args')).toEqual({ 
        command: 'bet', 
        args: ['100', 'extra', 'args'] 
      });
    });

    it('is case insensitive', () => {
      expect(parseCommand('/FOLD')).toEqual({ command: 'fold', args: [] });
      expect(parseCommand('/BET 100')).toEqual({ command: 'bet', args: ['100'] });
    });

    it('returns null for non-commands', () => {
      expect(parseCommand('hello')).toBeNull();
      expect(parseCommand('')).toBeNull();
      expect(parseCommand('/ ')).toBeNull();
    });

    it('returns null for invalid commands', () => {
      expect(parseCommand('/invalid')).toBeNull();
      expect(parseCommand('/foo')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseCommand('  /fold  ')).toEqual({ command: 'fold', args: [] });
      expect(parseCommand('/bet   100   ')).toEqual({ command: 'bet', args: ['100'] });
    });
  });

  describe('getCommandSuggestions', () => {
    it('returns all commands for /', () => {
      const suggestions = getCommandSuggestions('/');
      expect(suggestions).toContain('/fold');
      expect(suggestions).toContain('/check');
      expect(suggestions).toContain('/call');
      expect(suggestions).toContain('/bet');
      expect(suggestions).toContain('/help');
    });

    it('filters commands by prefix', () => {
      expect(getCommandSuggestions('/ch')).toEqual(['/check']);
      expect(getCommandSuggestions('/b')).toEqual(['/bet', '/block']);
      expect(getCommandSuggestions('/un')).toEqual(['/unmute', '/unblock']);
    });

    it('returns empty array for non-matching prefix', () => {
      expect(getCommandSuggestions('/xyz')).toEqual([]);
    });

    it('returns empty array for non-commands', () => {
      expect(getCommandSuggestions('hello')).toEqual([]);
      expect(getCommandSuggestions('')).toEqual([]);
    });

    it('is case insensitive', () => {
      expect(getCommandSuggestions('/CH')).toEqual(['/check']);
      expect(getCommandSuggestions('/FOLD')).toEqual(['/fold']);
    });
  });

  describe('validateBetAmount', () => {
    it('validates positive numbers', () => {
      expect(validateBetAmount('100')).toBe(100);
      expect(validateBetAmount('25.50')).toBe(25.50);
      expect(validateBetAmount('0.01')).toBe(0.01);
    });

    it('rounds to 2 decimal places', () => {
      expect(validateBetAmount('100.999')).toBe(101);
      expect(validateBetAmount('25.504')).toBe(25.50);
      expect(validateBetAmount('10.005')).toBe(10.01);
    });

    it('returns null for invalid amounts', () => {
      expect(validateBetAmount('')).toBeNull();
      expect(validateBetAmount('abc')).toBeNull();
      expect(validateBetAmount('-10')).toBeNull();
      expect(validateBetAmount('0')).toBeNull();
    });

    it('handles edge cases', () => {
      expect(validateBetAmount('  100  ')).toBe(100);
      expect(validateBetAmount('100.00')).toBe(100);
      expect(validateBetAmount('.5')).toBe(0.5);
    });
  });

  describe('formatCommandHelp', () => {
    it('returns help text with all commands', () => {
      const help = formatCommandHelp();
      
      expect(help).toContain('Available commands:');
      expect(help).toContain('/fold');
      expect(help).toContain('/check');
      expect(help).toContain('/call');
      expect(help).toContain('/bet <amount>');
      expect(help).toContain('/raise <amount>');
      expect(help).toContain('/allin');
      expect(help).toContain('/mute <player>');
      expect(help).toContain('/unmute <player>');
      expect(help).toContain('/block <player>');
      expect(help).toContain('/unblock <player>');
      expect(help).toContain('/help');
    });

    it('includes descriptions', () => {
      const help = formatCommandHelp();
      
      expect(help).toContain('Fold your hand');
      expect(help).toContain('Check (when no bet to call)');
      expect(help).toContain('Call the current bet');
      expect(help).toContain('Place a bet');
      expect(help).toContain('Raise the bet');
      expect(help).toContain('Go all-in');
    });
  });
});