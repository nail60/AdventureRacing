import { Router } from 'express';
import multer from 'multer';
import {
  listScenes,
  getSceneDetail,
  getCompressedTrack,
  deleteScene,
  addTaskToScene,
  deleteTaskFromScene,
  listTracklogs,
  getTracklog,
} from '../services/sceneService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const taskUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (['xctsk', 'tsk'].includes(ext || '')) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported task file type: ${file.originalname}`));
    }
  },
});

// GET /api/scenes
router.get('/', (_req, res) => {
  const scenes = listScenes();
  res.json(scenes);
});

// GET /api/scenes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const scene = await getSceneDetail(req.params.id);
    if (!scene) throw new AppError(404, 'Scene not found');
    res.json(scene);
  } catch (err) {
    next(err);
  }
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

// POST /api/scenes/:id/task
router.post('/:id/task', taskUpload.single('file'), async (req, res, next) => {
  try {
    const file = req.file as Express.Multer.File;
    if (!file) throw new AppError(400, 'Task file is required');
    const taskData = await addTaskToScene(req.params.id, file);
    res.status(201).json(taskData);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/scenes/:id/task
router.delete('/:id/task', async (req, res, next) => {
  try {
    const deleted = await deleteTaskFromScene(req.params.id);
    if (!deleted) throw new AppError(404, 'No task found on this scene');
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
