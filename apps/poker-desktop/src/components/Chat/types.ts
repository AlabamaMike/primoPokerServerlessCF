export interface ChatMessage {
  id: string;
  username: string;
  userId: string;
  message: string;
  timestamp: Date;
  isSystem: boolean;
  isCommand?: boolean;
  channel?: 'game' | 'spectator';
}

export interface ChatCommand {
  command: string;
  args?: string[];
}

export interface PlayerModerationState {
  mutedPlayers: Set<string>;
  blockedPlayers: Set<string>;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onCommand?: (command: ChatCommand) => void;
  onMutePlayer?: (playerId: string) => void;
  onBlockPlayer?: (playerId: string) => void;
  currentUserId?: string;
  isConnected: boolean;
  className?: string;
}

export interface MessageListProps {
  messages: ChatMessage[];
  currentUserId?: string;
  moderationState: PlayerModerationState;
  onPlayerAction?: (playerId: string, action: 'mute' | 'block' | 'report') => void;
}

export interface MessageInputProps {
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface PlayerActionsProps {
  playerId: string;
  username: string;
  isMuted: boolean;
  isBlocked: boolean;
  onMute: () => void;
  onBlock: () => void;
  onReport?: () => void;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

export interface UnreadIndicatorProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}