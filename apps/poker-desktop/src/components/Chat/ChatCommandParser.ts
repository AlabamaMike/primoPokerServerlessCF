import { ChatCommand } from './types';

const VALID_COMMANDS = [
  'fold',
  'check',
  'call',
  'bet',
  'raise',
  'all-in',
  'help',
] as const;

export type ValidCommand = typeof VALID_COMMANDS[number];

export function parseChatCommand(input: string): ChatCommand | null {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith('/')) {
    return null;
  }
  
  // Remove the leading slash
  const withoutSlash = trimmed.slice(1);
  
  // Split into command and arguments
  const parts = withoutSlash.split(/\s+/);
  
  if (parts.length === 0 || parts[0] === '') {
    return null;
  }
  
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ') || undefined;
  
  return {
    command,
    args,
    raw: input,
  };
}

export function isValidCommand(command: string): boolean {
  return VALID_COMMANDS.includes(command.toLowerCase() as ValidCommand);
}

export function getCommandSuggestions(input: string): string[] {
  const lowerInput = input.toLowerCase();
  
  if (!lowerInput) {
    return [...VALID_COMMANDS];
  }
  
  return VALID_COMMANDS.filter(cmd => cmd.startsWith(lowerInput));
}

export function getCommandHelp(command?: string): string {
  const helpText: Record<ValidCommand | 'general', string> = {
    general: `Available commands:
/fold - Fold your hand
/check - Check (no bet)
/call - Call the current bet
/bet <amount> - Place a bet
/raise <amount> - Raise the current bet
/all-in - Bet all your chips
/help [command] - Show help`,
    fold: 'Fold your hand and forfeit the pot',
    check: 'Pass the action to the next player without betting (only when no bet is required)',
    call: 'Match the current bet',
    bet: 'Place a bet. Usage: /bet <amount>',
    raise: 'Increase the current bet. Usage: /raise <amount>',
    'all-in': 'Bet all your remaining chips',
    help: 'Show available commands. Usage: /help [command]',
  };
  
  if (command && command in helpText) {
    return helpText[command as ValidCommand];
  }
  
  return helpText.general;
}

export function validateCommandArgs(command: string, args?: string): { valid: boolean; error?: string } {
  switch (command) {
    case 'bet':
    case 'raise':
      if (!args) {
        return { valid: false, error: `/${command} requires an amount` };
      }
      const amount = parseInt(args, 10);
      if (isNaN(amount) || amount <= 0) {
        return { valid: false, error: `Invalid amount: ${args}` };
      }
      return { valid: true };
      
    case 'fold':
    case 'check':
    case 'call':
    case 'all-in':
      if (args) {
        return { valid: false, error: `/${command} does not take arguments` };
      }
      return { valid: true };
      
    case 'help':
      // Help can have optional command argument
      return { valid: true };
      
    default:
      return { valid: false, error: `Unknown command: /${command}` };
  }
}