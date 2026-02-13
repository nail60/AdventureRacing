import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getDb } from './db/database.js';
import uploadRouter from './routes/upload.js';
import scenesRouter, { tracklogRouter } from './routes/scenes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize database
getDb();

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/scenes', scenesRouter);
app.use('/api/tracklogs', tracklogRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
