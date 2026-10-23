import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { assignRequestId } from './auth/authMiddleware.js';
import { documentRouter } from './documents/documentRoutes.js';
import { adminRouter } from './admin/adminRoutes.js';
import { authRouter } from './auth/authRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // 1. Assign unique correlation request ID to all requests
  app.use(assignRequestId);

  // 2. Strict Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // 3. CORS Configuration
  app.use(
    cors({
      origin: env.PUBLIC_APP_ORIGIN,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  // 4. JSON Body Parser with strict limit
  app.use(express.json({ limit: '1mb' }));

  // 5. Public Health Liveness Check (/healthz as required by spec)
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'TrustVault', timestamp: new Date().toISOString() });
  });

  // 6. Mount API Routes
  app.use('/api/auth', authRouter);
  app.use('/api', documentRouter);
  app.use('/api', adminRouter);

  // 7. Serve Static Frontend SPA if built
  const clientDistPath = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDistPath));

  app.use((req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path === '/healthz') {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        res.status(200).send(`
          <!DOCTYPE html>
          <html>
            <head><title>TrustVault API</title></head>
            <body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#f8fafc;">
              <h1>TrustVault API Server is Running</h1>
              <p>Endpoints mounted under <code>/api</code> and <code>/healthz</code>.</p>
              <p>For the interactive frontend, launch the Vite client dev server or run <code>npm run build</code>.</p>
            </body>
          </html>
        `);
      }
    });
  });

  // 8. Central Error Handler
  app.use(errorHandler);

  return app;
}
