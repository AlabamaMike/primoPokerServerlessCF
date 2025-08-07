export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  type: 'chat' | 'system' | 'command';
}

export interface ChatCommand {
  command: string;
  args?: string;
  raw: string;
}

export interface PlayerActionEvent {
  playerId: string;
  action: 'mute' | 'block' | 'report';
  data?: unknown;
}

export interface ReportData {
  reason: 'inappropriate-language' | 'cheating' | 'harassment' | 'spam' | 'other';
  details?: string;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onCommand: (command: string, args?: string) => void;
  onMutePlayer: (playerId: string) => void;
  onBlockPlayer: (playerId: string) => void;
  isConnected: boolean;
  currentUserId: string;
  mutedPlayers: Set<string>;
  blockedPlayers: Set<string>;
  className?: string;
}

export interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  blockedPlayers: Set<string>;
  onPlayerAction?: (playerId: string, event: MouseEvent) => void;
  showBlockedPlaceholder?: boolean;
  className?: string;
}

export interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onCommand: (command: string, args?: string) => void;
  isConnected: boolean;
  maxLength?: number;
  multiline?: boolean;
  className?: string;
}

export interface PlayerActionsProps {
  playerId: string;
  playerName: string;
  onMute: (playerId: string) => void;
  onBlock: (playerId: string) => void;
  onReport: (playerId: string, data: ReportData) => void;
  onClose?: () => void;
  isMuted: boolean;
  isBlocked: boolean;
  position: { x: number; y: number };
  showMuteDuration?: boolean;
  confirmBeforeBlock?: boolean;
}

export interface UnreadIndicatorProps {
  count: number;
  onClick?: () => void;
  maxCount?: number;
  size?: 'small' | 'medium' | 'large';
  color?: string;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  animate?: boolean;
  animationType?: 'pulse' | 'bounce';
  className?: string;
}