import { Router, IRequest } from 'itty-router';
import { 
  CreatePlayerNoteSchema,
  PlayerNoteError
} from '@primo-poker/shared';
import { PlayerNotesRepository } from '@primo-poker/persistence/src/player-notes-repository';
import { AuthMiddleware } from '../middleware/auth';
import { withErrorHandling } from '../middleware/error-handler';
import { validateRequest } from '../middleware/validation';

const router = Router({ base: '/api/notes' });

// Create or update a note
router.post(
  '/',
  AuthMiddleware.requireAuth,
  validateRequest(CreatePlayerNoteSchema),
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const noteData = request.validatedData!;

    const repository = new PlayerNotesRepository(env.DB);
    const note = await repository.createOrUpdateNote(userId, noteData);

    return new Response(JSON.stringify(note), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Search notes - must come before /:subjectId to avoid route conflicts
router.get(
  '/search',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ 
        error: 'Search query must be at least 2 characters' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const repository = new PlayerNotesRepository(env.DB);
    const notes = await repository.searchNotes(userId, query, limit);

    return new Response(JSON.stringify({ notes, query }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Get a specific note about a player
router.get(
  '/:subjectId',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const subjectId = request.params.subjectId;

    const repository = new PlayerNotesRepository(env.DB);
    const note = await repository.getNote(userId, subjectId);

    if (!note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(note), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Get all notes by the current user
router.get(
  '/',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const repository = new PlayerNotesRepository(env.DB);
    const notes = await repository.getNotesByAuthor(userId, limit, offset);

    return new Response(JSON.stringify({ notes }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);

// Delete a note
router.delete(
  '/:subjectId',
  AuthMiddleware.requireAuth,
  withErrorHandling(async (request: IRequest, env: Env) => {
    const userId = request.user!.id;
    const subjectId = request.params.subjectId;

    const repository = new PlayerNotesRepository(env.DB);
    await repository.deleteNote(userId, subjectId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  })
);


export { router as playerNotesRoutes };