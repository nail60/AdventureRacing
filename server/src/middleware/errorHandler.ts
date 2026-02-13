import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if ((err as any).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large' });
    return;
  }

  if ((err as any).code === 'LIMIT_FILE_COUNT') {
    res.status(413).json({ error: 'Too many files' });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
