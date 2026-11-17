import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './config/env.js';
import { attachSession } from './middleware/session.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import uploadRoutes from './routes/upload.js';
import sheetsRoutes from './routes/sheets.js';
import sessionRoutes from './routes/session.js';
import chatRoutes from './routes/chat.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.isProd ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(attachSession);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, phase: 2 });
  });

  app.use('/api/upload', uploadRoutes);
  app.use('/api/sheets', sheetsRoutes);
  app.use('/api/session', sessionRoutes);
  app.use('/api/chat', chatRoutes);

  if (env.isProd && fs.existsSync(env.clientDist)) {
    app.use(express.static(env.clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(env.clientDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
