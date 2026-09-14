import express from 'express';
import cors from 'cors';
import { leadsRouter } from './routes/leads';
import { dedupeRouter } from './routes/dedupe';
import { dashboardRouter } from './routes/dashboard';

export const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/leads', leadsRouter);
app.use('/leads', dedupeRouter);
app.use('/dashboard', dashboardRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
