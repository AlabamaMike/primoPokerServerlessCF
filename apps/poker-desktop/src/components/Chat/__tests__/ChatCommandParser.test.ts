import { parseChatCommand, isValidCommand, getCommandSuggestions } from '../ChatCommandParser';

describe('ChatCommandParser', () => {
  describe('parseChatCommand', () => {
    it('should parse simple commands without arguments', () => {
      expect(parseChatCommand('/fold')).toEqual({
        command: 'fold',
        args: undefined,
        raw: '/fold',
      });

      expect(parseChatCommand('/check')).toEqual({
        command: 'check',
        args: undefined,
        raw: '/check',
      });

      expect(parseChatCommand('/all-in')).toEqual({
        command: 'all-in',
        args: undefined,
        raw: '/all-in',
      });
    });

    it('should parse commands with arguments', () => {
      expect(parseChatCommand('/bet 100')).toEqual({
        command: 'bet',
        args: '100',
        raw: '/bet 100',
      });

      expect(parseChatCommand('/raise 250')).toEqual({
        command: 'raise',
        args: '250',
        raw: '/raise 250',
      });

      expect(parseChatCommand('/call 50')).toEqual({
        command: 'call',
        args: '50',
        raw: '/call 50',
      });
    });

    it('should parse commands with multiple arguments', () => {
      expect(parseChatCommand('/bet 100 min')).toEqual({
        command: 'bet',
        args: '100 min',
        raw: '/bet 100 min',
      });
    });

    it('should handle commands with extra whitespace', () => {
      expect(parseChatCommand('  /fold  ')).toEqual({
        command: 'fold',
        args: undefined,
        raw: '  /fold  ',
      });

      expect(parseChatCommand('/bet   100')).toEqual({
        command: 'bet',
        args: '100',
        raw: '/bet   100',
      });
    });

    it('should return null for non-commands', () => {
      expect(parseChatCommand('hello')).toBeNull();
      expect(parseChatCommand('/ not a command')).toBeNull();
      expect(parseChatCommand('')).toBeNull();
      expect(parseChatCommand(' ')).toBeNull();
    });

    it('should handle commands in different cases', () => {
      expect(parseChatCommand('/FOLD')).toEqual({
        command: 'fold',
        args: undefined,
        raw: '/FOLD',
      });

      expect(parseChatCommand('/Bet 100')).toEqual({
        command: 'bet',
        args: '100',
        raw: '/Bet 100',
      });
    });
  });

  describe('isValidCommand', () => {
    it('should validate known commands', () => {
      expect(isValidCommand('fold')).toBe(true);
      expect(isValidCommand('check')).toBe(true);
      expect(isValidCommand('call')).toBe(true);
      expect(isValidCommand('bet')).toBe(true);
      expect(isValidCommand('raise')).toBe(true);
      expect(isValidCommand('all-in')).toBe(true);
      expect(isValidCommand('help')).toBe(true);
    });

    it('should reject unknown commands', () => {
      expect(isValidCommand('unknown')).toBe(false);
      expect(isValidCommand('test')).toBe(false);
      expect(isValidCommand('')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidCommand('FOLD')).toBe(true);
      expect(isValidCommand('Check')).toBe(true);
      expect(isValidCommand('ALL-IN')).toBe(true);
    });
  });

  describe('getCommandSuggestions', () => {
    it('should return all commands when input is empty', () => {
      const suggestions = getCommandSuggestions('');
      expect(suggestions).toHaveLength(7);
      expect(suggestions).toContain('fold');
      expect(suggestions).toContain('check');
      expect(suggestions).toContain('call');
      expect(suggestions).toContain('bet');
      expect(suggestions).toContain('raise');
      expect(suggestions).toContain('all-in');
      expect(suggestions).toContain('help');
    });

    it('should filter commands based on input', () => {
      const suggestions = getCommandSuggestions('f');
      expect(suggestions).toEqual(['fold']);

      const checkSuggestions = getCommandSuggestions('ch');
      expect(checkSuggestions).toEqual(['check']);

      const allSuggestions = getCommandSuggestions('a');
      expect(allSuggestions).toEqual(['all-in']);
    });

    it('should return empty array for no matches', () => {
      const suggestions = getCommandSuggestions('xyz');
      expect(suggestions).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const suggestions = getCommandSuggestions('F');
      expect(suggestions).toEqual(['fold']);

      const checkSuggestions = getCommandSuggestions('CH');
      expect(checkSuggestions).toEqual(['check']);
    });

    it('should handle partial matches', () => {
      const suggestions = getCommandSuggestions('be');
      expect(suggestions).toEqual(['bet']);

      const raiseSuggestions = getCommandSuggestions('ra');
      expect(raiseSuggestions).toEqual(['raise']);
    });
  });

  describe('Command validation with arguments', () => {
    it('should validate bet command requires numeric argument', () => {
      const betCommand = parseChatCommand('/bet 100');
      expect(betCommand).not.toBeNull();
      if (betCommand) {
        expect(betCommand.command).toBe('bet');
        expect(betCommand.args).toBe('100');
        expect(parseInt(betCommand.args || '')).toBe(100);
      }
    });

    it('should validate raise command requires numeric argument', () => {
      const raiseCommand = parseChatCommand('/raise 250');
      expect(raiseCommand).not.toBeNull();
      if (raiseCommand) {
        expect(raiseCommand.command).toBe('raise');
        expect(raiseCommand.args).toBe('250');
        expect(parseInt(raiseCommand.args || '')).toBe(250);
      }
    });

    it('should handle invalid numeric arguments', () => {
      const invalidBet = parseChatCommand('/bet abc');
      expect(invalidBet).not.toBeNull();
      if (invalidBet) {
        expect(invalidBet.command).toBe('bet');
        expect(invalidBet.args).toBe('abc');
        expect(parseInt(invalidBet.args || '')).toBeNaN();
      }
    });
  });

  describe('Help command', () => {
    it('should parse help command', () => {
      const helpCommand = parseChatCommand('/help');
      expect(helpCommand).toEqual({
        command: 'help',
        args: undefined,
        raw: '/help',
      });
    });

    it('should parse help with specific command', () => {
      const helpBet = parseChatCommand('/help bet');
      expect(helpBet).toEqual({
        command: 'help',
        args: 'bet',
        raw: '/help bet',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle commands with special characters', () => {
      expect(parseChatCommand('/all-in')).toEqual({
        command: 'all-in',
        args: undefined,
        raw: '/all-in',
      });
    });

    it('should handle malformed commands', () => {
      expect(parseChatCommand('/')).toBeNull();
      expect(parseChatCommand('//')).toBeNull();
      expect(parseChatCommand('/ ')).toBeNull();
    });

    it('should preserve original casing in args', () => {
      const command = parseChatCommand('/bet 100USD');
      expect(command).toEqual({
        command: 'bet',
        args: '100USD',
        raw: '/bet 100USD',
      });
    });
  });
});