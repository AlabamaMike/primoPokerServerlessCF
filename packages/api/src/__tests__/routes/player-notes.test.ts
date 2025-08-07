import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { playerNotesRoutes } from '../../routes/player-notes';
import { 
  CannotNoteYourselfError,
  PlayerNoteError
} from '@primo-poker/shared';

// Mock PlayerNotesRepository
jest.mock('@primo-poker/persistence/src/player-notes-repository', () => ({
  PlayerNotesRepository: jest.fn().mockImplementation(() => ({
    createOrUpdateNote: jest.fn(),
    getNote: jest.fn(),
    getNotesByAuthor: jest.fn(),
    deleteNote: jest.fn(),
    searchNotes: jest.fn()
  }))
}));

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  AuthMiddleware: {
    requireAuth: (request: any) => {
      request.user = { id: 'test-user-id' };
      return request;
    }
  }
}));

jest.mock('../../middleware/validation', () => ({
  validateRequest: (schema: any) => (request: any) => {
    request.validatedData = request.body;
    return request;
  }
}));

jest.mock('../../middleware/error-handler', () => ({
  withErrorHandling: (fn: any) => fn
}));

import { PlayerNotesRepository } from '@primo-poker/persistence/src/player-notes-repository';

describe('Player Notes Routes', () => {
  let mockRepository: any;
  let mockEnv: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository = new (PlayerNotesRepository as any)();
    mockEnv = { DB: {} };
  });

  describe('POST /api/notes', () => {
    it('should create a new note', async () => {
      const mockNote = {
        id: 1,
        authorId: 'test-user-id',
        subjectId: 'player-123',
        note: 'Great bluffer, watch for tells',
        createdAt: '2025-01-01T00:00:00',
        updatedAt: '2025-01-01T00:00:00'
      };

      mockRepository.createOrUpdateNote.mockResolvedValue(mockNote);

      const request = {
        method: 'POST',
        url: 'http://localhost/api/notes',
        user: { id: 'test-user-id' },
        body: { subjectId: 'player-123', note: 'Great bluffer, watch for tells' },
        validatedData: { subjectId: 'player-123', note: 'Great bluffer, watch for tells' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockNote);
      expect(mockRepository.createOrUpdateNote).toHaveBeenCalledWith(
        'test-user-id',
        { subjectId: 'player-123', note: 'Great bluffer, watch for tells' }
      );
    });

    it('should handle errors when noting yourself', async () => {
      mockRepository.createOrUpdateNote.mockRejectedValue(new CannotNoteYourselfError());

      const request = {
        method: 'POST',
        url: 'http://localhost/api/notes',
        user: { id: 'test-user-id' },
        body: { subjectId: 'test-user-id', note: 'Note about myself' },
        validatedData: { subjectId: 'test-user-id', note: 'Note about myself' }
      };

      await expect(playerNotesRoutes.handle(request, mockEnv)).rejects.toThrow(CannotNoteYourselfError);
    });
  });

  describe('GET /api/notes/:subjectId', () => {
    it('should retrieve a specific note', async () => {
      const mockNote = {
        id: 1,
        authorId: 'test-user-id',
        subjectId: 'player-123',
        note: 'Plays tight aggressive',
        createdAt: '2025-01-01T00:00:00',
        updatedAt: '2025-01-01T00:00:00'
      };

      mockRepository.getNote.mockResolvedValue(mockNote);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes/player-123',
        user: { id: 'test-user-id' },
        params: { subjectId: 'player-123' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockNote);
      expect(mockRepository.getNote).toHaveBeenCalledWith('test-user-id', 'player-123');
    });

    it('should return 404 when note not found', async () => {
      mockRepository.getNote.mockResolvedValue(null);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes/player-999',
        user: { id: 'test-user-id' },
        params: { subjectId: 'player-999' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Note not found' });
    });
  });

  describe('GET /api/notes', () => {
    it('should return all notes by author', async () => {
      const mockNotes = [
        {
          id: 1,
          authorId: 'test-user-id',
          subjectId: 'player-1',
          note: 'Note 1',
          createdAt: '2025-01-01T00:00:00',
          updatedAt: '2025-01-01T00:00:00'
        },
        {
          id: 2,
          authorId: 'test-user-id',
          subjectId: 'player-2',
          note: 'Note 2',
          createdAt: '2025-01-02T00:00:00',
          updatedAt: '2025-01-02T00:00:00'
        }
      ];

      mockRepository.getNotesByAuthor.mockResolvedValue(mockNotes);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes',
        user: { id: 'test-user-id' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ notes: mockNotes });
      expect(mockRepository.getNotesByAuthor).toHaveBeenCalledWith('test-user-id', 50, 0);
    });

    it('should handle pagination parameters', async () => {
      mockRepository.getNotesByAuthor.mockResolvedValue([]);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes?limit=10&offset=20',
        user: { id: 'test-user-id' }
      };

      await playerNotesRoutes.handle(request, mockEnv);

      expect(mockRepository.getNotesByAuthor).toHaveBeenCalledWith('test-user-id', 10, 20);
    });
  });

  describe('DELETE /api/notes/:subjectId', () => {
    it('should delete a note', async () => {
      mockRepository.deleteNote.mockResolvedValue(undefined);

      const request = {
        method: 'DELETE',
        url: 'http://localhost/api/notes/player-123',
        user: { id: 'test-user-id' },
        params: { subjectId: 'player-123' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockRepository.deleteNote).toHaveBeenCalledWith('test-user-id', 'player-123');
    });
  });

  describe('GET /api/notes/search', () => {
    it('should search notes', async () => {
      const mockNotes = [
        {
          id: 1,
          authorId: 'test-user-id',
          subjectId: 'player-1',
          note: 'Very aggressive player',
          createdAt: '2025-01-01T00:00:00',
          updatedAt: '2025-01-01T00:00:00'
        }
      ];

      mockRepository.searchNotes.mockResolvedValue(mockNotes);

      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes/search?q=aggressive',
        user: { id: 'test-user-id' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ notes: mockNotes, query: 'aggressive' });
      expect(mockRepository.searchNotes).toHaveBeenCalledWith('test-user-id', 'aggressive', 20);
    });

    it('should validate minimum query length', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes/search?q=a',
        user: { id: 'test-user-id' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Search query must be at least 2 characters' });
      expect(mockRepository.searchNotes).not.toHaveBeenCalled();
    });

    it('should handle missing query parameter', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost/api/notes/search',
        user: { id: 'test-user-id' }
      };

      const response = await playerNotesRoutes.handle(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Search query must be at least 2 characters' });
    });
  });
});