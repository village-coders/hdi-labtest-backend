import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/db.js';
import apiRoutes from './routes/api.js';
import { seedDatabase } from './services/seedData.js';
import { initCronJobs } from './services/cronService.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any origin dynamically so Vercel subdomains and local dev work with credentials: true
      callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static uploads serving
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'HDI Sample Registration & Dispatch Portal API',
  });
});

// Start Server
const startServer = async () => {
  try {
    const server = app.listen(PORT, () => {
      console.log(`[Server Ready]: HDI Lab Portal Backend running on http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server Port Conflict]: Port ${PORT} is currently in use. Please terminate any other instance running on port ${PORT}.`);
      } else {
        console.error('[Server Error]:', err);
      }
    });

    // Connect to database and seed data
    await connectDB();
    await seedDatabase();
    initCronJobs();
  } catch (error) {
    console.error('[Startup Error]:', error);
  }
};

startServer();
