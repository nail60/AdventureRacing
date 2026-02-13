import { Router } from 'express';
import {
  listScenes,
  getSceneDetail,
  getCompressedTrack,
  deleteScene,
  listTracklogs,
  getTracklog,
} from '../services/sceneService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/scenes
router.get('/', (_req, res) => {
  const scenes = listScenes();
  res.json(scenes);
});

// GET /api/scenes/:id
router.get('/:id', (req, res) => {
  const scene = getSceneDetail(req.params.id);
  if (!scene) throw new AppError(404, 'Scene not found');
  res.json(scene);
});

// GET /api/scenes/:id/tracks/:tracklogId
router.get('/:id/tracks/:tracklogId', async (req, res, next) => {
  try {
    const track = await getCompressedTrack(req.params.id, req.params.tracklogId);
    if (!track) throw new AppError(404, 'Track not found');
    res.json(track);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/scenes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteScene(req.params.id);
    if (!deleted) throw new AppError(404, 'Scene not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

// Tracklog routes (separate router)
export const tracklogRouter = Router();

tracklogRouter.get('/', (_req, res) => {
  const tracklogs = listTracklogs();
  res.json(tracklogs);
});

tracklogRouter.get('/:id', (req, res) => {
  const tracklog = getTracklog(req.params.id);
  if (!tracklog) throw new AppError(404, 'Tracklog not found');
  res.json(tracklog);
});
