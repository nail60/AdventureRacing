import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { createScene } from '../services/sceneService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
    files: config.maxFiles,
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (['igc', 'kmz', 'kml'].includes(ext || '')) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported file type: ${file.originalname}`));
    }
  },
});

router.post('/', upload.array('files', config.maxFiles), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    const sceneName = req.body.sceneName;

    if (!sceneName || typeof sceneName !== 'string') {
      throw new AppError(400, 'sceneName is required');
    }

    if (!files || files.length === 0) {
      throw new AppError(400, 'At least one file is required');
    }

    const result = await createScene(sceneName, files);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
