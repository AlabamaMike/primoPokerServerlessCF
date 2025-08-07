import { 
  PlayerNote,
  CreatePlayerNote,
  PlayerNoteError,
  CannotNoteYourselfError
} from '@primo-poker/shared';

export interface IPlayerNotesRepository {
  createOrUpdateNote(authorId: string, note: CreatePlayerNote): Promise<PlayerNote>;
  getNote(authorId: string, subjectId: string): Promise<PlayerNote | null>;
  getNotesByAuthor(authorId: string, limit?: number, offset?: number): Promise<PlayerNote[]>;
  deleteNote(authorId: string, subjectId: string): Promise<void>;
  searchNotes(authorId: string, query: string, limit?: number): Promise<PlayerNote[]>;
}

export class PlayerNotesRepository implements IPlayerNotesRepository {
  constructor(private db: D1Database) {}

  async createOrUpdateNote(authorId: string, note: CreatePlayerNote): Promise<PlayerNote> {
    // Validate not creating note about self
    if (authorId === note.subjectId) {
      throw new CannotNoteYourselfError();
    }

    // Check if note already exists
    const existing = await this.db.prepare(`
      SELECT * FROM player_notes 
      WHERE author_id = ? AND subject_id = ?
    `).bind(authorId, note.subjectId).first();

    if (existing) {
      // Update existing note
      const result = await this.db.prepare(`
        UPDATE player_notes 
        SET note = ?, updated_at = datetime('now')
        WHERE author_id = ? AND subject_id = ?
        RETURNING *
      `).bind(note.note, authorId, note.subjectId).first<PlayerNote>();

      if (!result) {
        throw new PlayerNoteError('Failed to update note');
      }

      return this.mapToPlayerNote(result);
    } else {
      // Create new note
      const result = await this.db.prepare(`
        INSERT INTO player_notes (author_id, subject_id, note)
        VALUES (?, ?, ?)
        RETURNING *
      `).bind(authorId, note.subjectId, note.note).first<PlayerNote>();

      if (!result) {
        throw new PlayerNoteError('Failed to create note');
      }

      return this.mapToPlayerNote(result);
    }
  }

  async getNote(authorId: string, subjectId: string): Promise<PlayerNote | null> {
    const result = await this.db.prepare(`
      SELECT * FROM player_notes 
      WHERE author_id = ? AND subject_id = ?
    `).bind(authorId, subjectId).first();

    return result ? this.mapToPlayerNote(result) : null;
  }

  async getNotesByAuthor(authorId: string, limit: number = 50, offset: number = 0): Promise<PlayerNote[]> {
    const results = await this.db.prepare(`
      SELECT pn.*, u.username, u.displayName as display_name
      FROM player_notes pn
      JOIN users u ON u.id = pn.subject_id
      WHERE pn.author_id = ?
      ORDER BY pn.updated_at DESC
      LIMIT ? OFFSET ?
    `).bind(authorId, limit, offset).all();

    return results.results.map(row => this.mapToPlayerNoteWithUserInfo(row));
  }

  async deleteNote(authorId: string, subjectId: string): Promise<void> {
    await this.db.prepare(`
      DELETE FROM player_notes 
      WHERE author_id = ? AND subject_id = ?
    `).bind(authorId, subjectId).run();
  }

  async searchNotes(authorId: string, query: string, limit: number = 20): Promise<PlayerNote[]> {
    // Search in note content and subject's username/display name
    const results = await this.db.prepare(`
      SELECT pn.*, u.username, u.displayName as display_name
      FROM player_notes pn
      JOIN users u ON u.id = pn.subject_id
      WHERE pn.author_id = ? 
        AND (pn.note LIKE ? OR u.username LIKE ? OR u.displayName LIKE ?)
      ORDER BY pn.updated_at DESC
      LIMIT ?
    `).bind(
      authorId, 
      `%${query}%`, 
      `%${query}%`, 
      `%${query}%`, 
      limit
    ).all();

    return results.results.map(row => this.mapToPlayerNoteWithUserInfo(row));
  }

  private mapToPlayerNote(row: any): PlayerNote {
    return {
      id: row.id,
      authorId: row.author_id,
      subjectId: row.subject_id,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToPlayerNoteWithUserInfo(row: any): PlayerNote {
    return {
      id: row.id,
      authorId: row.author_id,
      subjectId: row.subject_id,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}