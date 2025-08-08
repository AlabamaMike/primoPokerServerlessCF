import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PlayerNotesRepository } from '../player-notes-repository';
import { 
  CannotNoteYourselfError,
  PlayerNoteError
} from '@primo-poker/shared';

// Mock D1Database
const mockDb = {
  prepare: jest.fn().mockReturnThis(),
  bind: jest.fn().mockReturnThis(),
  first: jest.fn(),
  run: jest.fn(),
  all: jest.fn()
};

describe('PlayerNotesRepository', () => {
  let repository: PlayerNotesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PlayerNotesRepository(mockDb as any);
  });

  describe('createOrUpdateNote', () => {
    it('should create a new note', async () => {
      const authorId = 'user1';
      const note = {
        subjectId: 'user2',
        note: 'Great player, aggressive style'
      };
      const mockResult = {
        id: 1,
        author_id: authorId,
        subject_id: note.subjectId,
        note: note.note,
        created_at: '2025-01-01T00:00:00',
        updated_at: '2025-01-01T00:00:00'
      };

      mockDb.first
        .mockResolvedValueOnce(null) // No existing note
        .mockResolvedValueOnce(mockResult); // Create result

      const result = await repository.createOrUpdateNote(authorId, note);

      expect(result).toEqual({
        id: 1,
        authorId,
        subjectId: note.subjectId,
        note: note.note,
        createdAt: '2025-01-01T00:00:00',
        updatedAt: '2025-01-01T00:00:00'
      });
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    });

    it('should update an existing note', async () => {
      const authorId = 'user1';
      const note = {
        subjectId: 'user2',
        note: 'Updated note: plays more conservatively now'
      };
      const existingNote = {
        id: 1,
        author_id: authorId,
        subject_id: note.subjectId,
        note: 'Old note',
        created_at: '2025-01-01T00:00:00',
        updated_at: '2025-01-01T00:00:00'
      };
      const updatedNote = {
        ...existingNote,
        note: note.note,
        updated_at: '2025-01-02T00:00:00'
      };

      mockDb.first
        .mockResolvedValueOnce(existingNote) // Existing note found
        .mockResolvedValueOnce(updatedNote); // Update result

      const result = await repository.createOrUpdateNote(authorId, note);

      expect(result.note).toBe(note.note);
      expect(result.updatedAt).toBe('2025-01-02T00:00:00');
    });

    it('should throw error when creating note about self', async () => {
      const userId = 'user1';
      const note = {
        subjectId: userId,
        note: 'Note about myself'
      };

      await expect(repository.createOrUpdateNote(userId, note))
        .rejects.toThrow(CannotNoteYourselfError);
      
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should throw error when create fails', async () => {
      const authorId = 'user1';
      const note = {
        subjectId: 'user2',
        note: 'Test note'
      };

      mockDb.first
        .mockResolvedValueOnce(null) // No existing note
        .mockResolvedValueOnce(null); // Create fails

      await expect(repository.createOrUpdateNote(authorId, note))
        .rejects.toThrow(PlayerNoteError);
    });
  });

  describe('getNote', () => {
    it('should retrieve a specific note', async () => {
      const authorId = 'user1';
      const subjectId = 'user2';
      const mockNote = {
        id: 1,
        author_id: authorId,
        subject_id: subjectId,
        note: 'Test note',
        created_at: '2025-01-01T00:00:00',
        updated_at: '2025-01-01T00:00:00'
      };

      mockDb.first.mockResolvedValueOnce(mockNote);

      const result = await repository.getNote(authorId, subjectId);

      expect(result).toEqual({
        id: 1,
        authorId,
        subjectId,
        note: 'Test note',
        createdAt: '2025-01-01T00:00:00',
        updatedAt: '2025-01-01T00:00:00'
      });
    });

    it('should return null when note not found', async () => {
      mockDb.first.mockResolvedValueOnce(null);

      const result = await repository.getNote('user1', 'user2');

      expect(result).toBeNull();
    });
  });

  describe('getNotesByAuthor', () => {
    it('should return all notes by an author', async () => {
      const authorId = 'user1';
      const mockResults = {
        results: [
          {
            id: 1,
            author_id: authorId,
            subject_id: 'user2',
            note: 'Note 1',
            created_at: '2025-01-01T00:00:00',
            updated_at: '2025-01-01T00:00:00',
            username: 'player2',
            display_name: 'Player Two'
          },
          {
            id: 2,
            author_id: authorId,
            subject_id: 'user3',
            note: 'Note 2',
            created_at: '2025-01-02T00:00:00',
            updated_at: '2025-01-02T00:00:00',
            username: 'player3',
            display_name: 'Player Three'
          }
        ]
      };

      mockDb.all.mockResolvedValueOnce(mockResults);

      const notes = await repository.getNotesByAuthor(authorId);

      expect(notes).toHaveLength(2);
      expect(notes[0].subjectId).toBe('user2');
      expect(notes[1].subjectId).toBe('user3');
    });

    it('should respect limit and offset parameters', async () => {
      const authorId = 'user1';
      mockDb.all.mockResolvedValueOnce({ results: [] });

      await repository.getNotesByAuthor(authorId, 10, 20);

      expect(mockDb.bind).toHaveBeenCalledWith(authorId, 10, 20);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      const authorId = 'user1';
      const subjectId = 'user2';

      mockDb.run.mockResolvedValueOnce({});

      await repository.deleteNote(authorId, subjectId);

      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      expect(mockDb.bind).toHaveBeenCalledWith(authorId, subjectId);
      expect(mockDb.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchNotes', () => {
    it('should search notes by content and user info', async () => {
      const authorId = 'user1';
      const query = 'aggressive';
      const mockResults = {
        results: [
          {
            id: 1,
            author_id: authorId,
            subject_id: 'user2',
            note: 'Very aggressive player',
            created_at: '2025-01-01T00:00:00',
            updated_at: '2025-01-01T00:00:00',
            username: 'player2',
            display_name: 'Player Two'
          }
        ]
      };

      mockDb.all.mockResolvedValueOnce(mockResults);

      const notes = await repository.searchNotes(authorId, query);

      expect(notes).toHaveLength(1);
      expect(notes[0].note).toContain('aggressive');
      expect(mockDb.bind).toHaveBeenCalledWith(
        authorId,
        '%aggressive%',
        '%aggressive%',
        '%aggressive%',
        20
      );
    });

    it('should respect custom limit', async () => {
      const authorId = 'user1';
      const query = 'test';
      mockDb.all.mockResolvedValueOnce({ results: [] });

      await repository.searchNotes(authorId, query, 5);

      expect(mockDb.bind).toHaveBeenCalledWith(
        authorId,
        '%test%',
        '%test%',
        '%test%',
        5
      );
    });
  });
});