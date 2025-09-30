import { Router, IRequest } from 'itty-router';
import {
  CreatePlayerNoteSchema,
  PlayerNoteError,
  SOCIAL_CONSTANTS
} from '@primo-poker/shared';
import { PlayerNotesRepository } from '@primo-poker/persistence';
import { authenticateUser } from '../middleware/auth';
import { withErrorHandling } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';
import { socialRateLimiter } from '../middleware/rate-limiter';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers';

const router = Router({ base: '/api/notes' });

// Create or update a note
router.post(
  '/',
  authenticateUser,
  socialRateLimiter.middleware(),
  validateRequest(CreatePlayerNoteSchema),
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const noteData = request.validatedData!;

    const repository = new PlayerNotesRepository(env.DB);
    const note = await repository.createOrUpdateNote(userId, noteData);

    return createSuccessResponse(note, 201);
  })
);

// Search notes - must come before /:subjectId to avoid route conflicts
router.get(
  '/search',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || String(SOCIAL_CONSTANTS.DEFAULT_PAGINATION_LIMIT)), SOCIAL_CONSTANTS.MAX_PAGINATION_LIMIT);

    if (!query || query.length < SOCIAL_CONSTANTS.MIN_SEARCH_QUERY_LENGTH) {
      return createErrorResponse(
        `Search query must be at least ${SOCIAL_CONSTANTS.MIN_SEARCH_QUERY_LENGTH} characters`,
        400,
        'INVALID_SEARCH_QUERY'
      );
    }

    const repository = new PlayerNotesRepository(env.DB);
    const notes = await repository.searchNotes(userId, query, limit);

    return createSuccessResponse({ notes, query });
  })
);

// Get a specific note about a player
router.get(
  '/:subjectId',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const subjectId = request.params.subjectId;

    const repository = new PlayerNotesRepository(env.DB);
    const note = await repository.getNote(userId, subjectId);

    if (!note) {
      return createErrorResponse('Note not found', 404, 'NOTE_NOT_FOUND');
    }

    return createSuccessResponse(note);
  })
);

// Get all notes by the current user
router.get(
  '/',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || String(SOCIAL_CONSTANTS.DEFAULT_NOTE_PAGINATION_LIMIT)), SOCIAL_CONSTANTS.MAX_PAGINATION_LIMIT);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const repository = new PlayerNotesRepository(env.DB);
    const notes = await repository.getNotesByAuthor(userId, limit, offset);

    return createSuccessResponse({ notes });
  })
);

// Delete a note
router.delete(
  '/:subjectId',
  authenticateUser,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const subjectId = request.params.subjectId;

    const repository = new PlayerNotesRepository(env.DB);
    await repository.deleteNote(userId, subjectId);

    return createSuccessResponse({ message: 'Note deleted' });
  })
);


export { router as playerNotesRoutes };