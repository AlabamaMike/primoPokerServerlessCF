import { ChatCommand } from '../types';

const VALID_COMMANDS = [
  'fold',
  'check',
  'call',
  'bet',
  'raise',
  'allin',
  'help',
  'mute',
  'unmute',
  'block',
  'unblock'
] as const;

export type ValidCommand = typeof VALID_COMMANDS[number];

export function parseCommand(message: string): ChatCommand | null {
  if (!message.startsWith('/')) {
    return null;
  }

  const parts = message.slice(1).trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();

  if (!command || !VALID_COMMANDS.includes(command as ValidCommand)) {
    return null;
  }

  return {
    command: command as ValidCommand,
    args: parts.slice(1)
  };
}

export function getCommandSuggestions(input: string): string[] {
  if (!input.startsWith('/')) {
    return [];
  }

  const prefix = input.slice(1).toLowerCase();
  
  if (!prefix) {
    return VALID_COMMANDS.map(cmd => `/${cmd}`);
  }

  return VALID_COMMANDS
    .filter(cmd => cmd.startsWith(prefix))
    .map(cmd => `/${cmd}`);
}

export function formatCommandHelp(): string {
  return `
Available commands:
/fold - Fold your hand
/check - Check (when no bet to call)
/call - Call the current bet
/bet <amount> - Place a bet
/raise <amount> - Raise the bet
/allin - Go all-in
/mute <player> - Mute a player
/unmute <player> - Unmute a player
/block <player> - Block a player
/unblock <player> - Unblock a player
/help - Show this help message
`.trim();
}

export function validateBetAmount(amount: string): number | null {
  const parsed = parseFloat(amount);
  
  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }
  
  // Round to 2 decimal places
  return Math.round(parsed * 100) / 100;
}