export interface Table {
  id: string;
  name: string;
  gameType: GameType;
  stakes: Stakes;
  players: number;
  maxPlayers: number;
  avgPot: number;
  speed: 'slow' | 'normal' | 'fast';
  waitlist: number;
  features: TableFeature[];
  rakebackPercent?: number;
  playersPerFlop?: number;
  handsPerHour?: number;
}

export interface Stakes {
  small: number;
  big: number;
  currency: string;
}

export type GameType = 'nlhe' | 'plo' | 'plo5' | 'shortdeck' | 'mixed';

export type TableFeature = 'featured' | 'speed' | 'lucky8' | 'beginner' | 'deepstack' | 'rakeback' | 'jackpot';

export interface Filters {
  gameTypes: GameType[];
  stakes: StakeLevel[];
  tableSizes: number[];
  features: TableFeature[];
}

export type StakeLevel = 'micro' | 'low' | 'mid' | 'high';

export interface Player {
  id: string;
  username: string;
  chips: number;
  position: number;
  status: 'active' | 'sitting' | 'away';
  isHero?: boolean;
}