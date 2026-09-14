import { Router, Request, Response } from 'express';
import { LeadService } from '../services/leadService';

export const dashboardRouter = Router();

// GET /dashboard - lead counts by status and by channel
dashboardRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await LeadService.getDashboardMetrics();
    res.json(metrics);
  } catch (err: any) {
    console.error('Error fetching dashboard metrics:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics', message: err.message });
  }
});
