import { RandomUtils } from '@primo-poker/shared';
import { Achievement, AchievementSchema } from './profile-manager';
import { PlayerStatistics, HandStatistics } from '@primo-poker/shared';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'gameplay' | 'social' | 'milestone' | 'special';
  checkCondition: (context: AchievementContext) => boolean;
}

export interface AchievementContext {
  playerId: string;
  stats: PlayerStatistics;
  recentHands?: HandStatistics[];
  currentHand?: HandStatistics;
  totalGamesPlayed?: number;
  totalWinnings?: number;
  biggestPotWon?: number;
  consecutiveWins?: number;
}

/**
 * Manages the achievement system, tracking player accomplishments
 * and awarding badges based on predefined criteria.
 */
export class AchievementManager {
  private playerAchievements: Map<string, Achievement[]> = new Map();
  private definitions: Map<string, AchievementDefinition> = new Map();

  constructor() {
    this.initializeAchievements();
  }

  /**
   * Initializes all achievement definitions.
   */
  private initializeAchievements(): void {
    // Gameplay achievements
    this.addAchievement({
      id: 'first-hand',
      name: 'Welcome to the Table',
      description: 'Play your first hand',
      rarity: 'common',
      category: 'gameplay',
      checkCondition: (ctx) => ctx.stats.handsPlayed >= 1
    });

    this.addAchievement({
      id: 'first-win',
      name: 'First Blood',
      description: 'Win your first hand',
      rarity: 'common',
      category: 'gameplay',
      checkCondition: (ctx) => ctx.stats.handsWon >= 1
    });

    this.addAchievement({
      id: 'hundred-hands',
      name: 'Century Player',
      description: 'Play 100 hands',
      rarity: 'common',
      category: 'milestone',
      checkCondition: (ctx) => ctx.stats.handsPlayed >= 100
    });

    this.addAchievement({
      id: 'thousand-hands',
      name: 'Grinder',
      description: 'Play 1,000 hands',
      rarity: 'rare',
      category: 'milestone',
      checkCondition: (ctx) => ctx.stats.handsPlayed >= 1000
    });

    this.addAchievement({
      id: 'ten-thousand-hands',
      name: 'Poker Veteran',
      description: 'Play 10,000 hands',
      rarity: 'epic',
      category: 'milestone',
      checkCondition: (ctx) => ctx.stats.handsPlayed >= 10000
    });

    this.addAchievement({
      id: 'showdown-master',
      name: 'Showdown Master',
      description: 'Win 75% of showdowns (min 100 showdowns)',
      rarity: 'epic',
      category: 'gameplay',
      checkCondition: (ctx) => 
        ctx.stats.showdownsSeen >= 100 && ctx.stats.wsd >= 75
    });

    this.addAchievement({
      id: 'aggressive-player',
      name: 'Aggressor',
      description: 'Maintain aggression factor above 3.0 (min 500 hands)',
      rarity: 'rare',
      category: 'gameplay',
      checkCondition: (ctx) => 
        ctx.stats.handsPlayed >= 500 && ctx.stats.aggressionFactor >= 3.0
    });

    this.addAchievement({
      id: 'tight-player',
      name: 'Rock',
      description: 'Maintain VPIP below 20% (min 500 hands)',
      rarity: 'rare',
      category: 'gameplay',
      checkCondition: (ctx) => 
        ctx.stats.handsPlayed >= 500 && ctx.stats.vpip <= 20
    });

    this.addAchievement({
      id: 'loose-aggressive',
      name: 'LAG Master',
      description: 'VPIP > 30% and PFR > 25% (min 1000 hands)',
      rarity: 'epic',
      category: 'gameplay',
      checkCondition: (ctx) => 
        ctx.stats.handsPlayed >= 1000 && ctx.stats.vpip > 30 && ctx.stats.pfr > 25
    });

    // Winning achievements
    this.addAchievement({
      id: 'big-pot-winner',
      name: 'Big Pot Hunter',
      description: 'Win a pot worth over 1,000 chips',
      rarity: 'rare',
      category: 'gameplay',
      checkCondition: (ctx) => (ctx.biggestPotWon || 0) >= 1000
    });

    this.addAchievement({
      id: 'mega-pot-winner',
      name: 'Whale',
      description: 'Win a pot worth over 10,000 chips',
      rarity: 'epic',
      category: 'gameplay',
      checkCondition: (ctx) => (ctx.biggestPotWon || 0) >= 10000
    });

    this.addAchievement({
      id: 'profitable-player',
      name: 'In the Black',
      description: 'Achieve lifetime profit of 10,000 chips',
      rarity: 'rare',
      category: 'milestone',
      checkCondition: (ctx) => (ctx.totalWinnings || 0) >= 10000
    });

    this.addAchievement({
      id: 'high-roller',
      name: 'High Roller',
      description: 'Achieve lifetime profit of 100,000 chips',
      rarity: 'legendary',
      category: 'milestone',
      checkCondition: (ctx) => (ctx.totalWinnings || 0) >= 100000
    });

    // Session achievements
    this.addAchievement({
      id: 'marathon-session',
      name: 'Marathon Runner',
      description: 'Play a session lasting over 4 hours',
      rarity: 'rare',
      category: 'milestone',
      checkCondition: (ctx) => ctx.stats.totalSessionDuration >= 14400 // 4 hours in seconds
    });

    this.addAchievement({
      id: 'consistent-winner',
      name: 'Consistent Winner',
      description: 'Have 75% profitable sessions (min 20 sessions)',
      rarity: 'epic',
      category: 'gameplay',
      checkCondition: (ctx) => 
        ctx.stats.sessionsPlayed >= 20 && 
        (ctx.stats.profitableSessions / ctx.stats.sessionsPlayed) >= 0.75
    });

    // Special achievements
    this.addAchievement({
      id: 'lucky-streak',
      name: 'Hot Streak',
      description: 'Win 10 hands in a row',
      rarity: 'epic',
      category: 'special',
      checkCondition: (ctx) => (ctx.consecutiveWins || 0) >= 10
    });

    this.addAchievement({
      id: 'comeback-kid',
      name: 'Comeback Kid',
      description: 'Win a hand after being down to less than 10 big blinds',
      rarity: 'rare',
      category: 'special',
      checkCondition: (ctx) => false // This needs special tracking
    });
  }

  /**
   * Adds a new achievement definition.
   */
  private addAchievement(definition: AchievementDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  /**
   * Checks and awards achievements for a player based on current context.
   */
  async checkAchievements(context: AchievementContext): Promise<Achievement[]> {
    const playerAchievements = this.playerAchievements.get(context.playerId) || [];
    const unlockedIds = new Set(playerAchievements.map(a => a.id));
    const newAchievements: Achievement[] = [];

    for (const [id, definition] of this.definitions) {
      if (!unlockedIds.has(id) && definition.checkCondition(context)) {
        const achievement: Achievement = {
          id: definition.id,
          name: definition.name,
          description: definition.description,
          unlockedAt: new Date(),
          rarity: definition.rarity
        };

        // Validate and store
        const validated = AchievementSchema.parse(achievement);
        playerAchievements.push(validated);
        newAchievements.push(validated);
      }
    }

    if (newAchievements.length > 0) {
      this.playerAchievements.set(context.playerId, playerAchievements);
    }

    return newAchievements;
  }

  /**
   * Gets all achievements for a player.
   */
  async getPlayerAchievements(playerId: string): Promise<Achievement[]> {
    return this.playerAchievements.get(playerId) || [];
  }

  /**
   * Gets achievement progress for a player.
   */
  async getAchievementProgress(playerId: string): Promise<AchievementProgress[]> {
    const playerAchievements = this.playerAchievements.get(playerId) || [];
    const unlockedIds = new Set(playerAchievements.map(a => a.id));
    const progress: AchievementProgress[] = [];

    for (const [id, definition] of this.definitions) {
      progress.push({
        achievementId: id,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        rarity: definition.rarity,
        unlocked: unlockedIds.has(id),
        unlockedAt: playerAchievements.find(a => a.id === id)?.unlockedAt
      });
    }

    return progress;
  }

  /**
   * Awards a special achievement manually.
   */
  async awardSpecialAchievement(playerId: string, achievementId: string): Promise<Achievement | null> {
    const definition = this.definitions.get(achievementId);
    if (!definition) {
      return null;
    }

    const playerAchievements = this.playerAchievements.get(playerId) || [];
    const existing = playerAchievements.find(a => a.id === achievementId);
    
    if (existing) {
      return existing;
    }

    const achievement: Achievement = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      unlockedAt: new Date(),
      rarity: definition.rarity
    };

    const validated = AchievementSchema.parse(achievement);
    playerAchievements.push(validated);
    this.playerAchievements.set(playerId, playerAchievements);

    return validated;
  }

  /**
   * Gets achievement statistics.
   */
  async getAchievementStats(): Promise<AchievementStats> {
    const totalPlayers = this.playerAchievements.size;
    const achievementCounts = new Map<string, number>();
    
    for (const [, achievements] of this.playerAchievements) {
      for (const achievement of achievements) {
        achievementCounts.set(
          achievement.id, 
          (achievementCounts.get(achievement.id) || 0) + 1
        );
      }
    }

    const rarestAchievements = Array.from(achievementCounts.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        name: this.definitions.get(id)?.name || 'Unknown',
        unlockedBy: count,
        percentage: totalPlayers > 0 ? (count / totalPlayers) * 100 : 0
      }));

    const mostCommonAchievements = Array.from(achievementCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        name: this.definitions.get(id)?.name || 'Unknown',
        unlockedBy: count,
        percentage: totalPlayers > 0 ? (count / totalPlayers) * 100 : 0
      }));

    return {
      totalAchievements: this.definitions.size,
      totalPlayers,
      rarestAchievements,
      mostCommonAchievements
    };
  }
}

export interface AchievementProgress {
  achievementId: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  unlocked: boolean;
  unlockedAt?: Date;
}

export interface AchievementStats {
  totalAchievements: number;
  totalPlayers: number;
  rarestAchievements: AchievementStat[];
  mostCommonAchievements: AchievementStat[];
}

export interface AchievementStat {
  id: string;
  name: string;
  unlockedBy: number;
  percentage: number;
}