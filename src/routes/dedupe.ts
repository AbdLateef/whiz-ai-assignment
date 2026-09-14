import { Router, Request, Response } from 'express';
import { DedupeService } from '../services/dedupeService';

export const dedupeRouter = Router();

// POST or GET /leads/dedupe-candidates - AI-assisted deduplication candidates
const handleDedupeCandidates = async (req: Request, res: Response): Promise<void> => {
  try {
    const limitQuery = req.query.limit || req.body.limit;
    const limit = limitQuery ? parseInt(String(limitQuery), 10) : 30;

    const candidateGroups = await DedupeService.findDuplicateCandidates(limit);

    res.json({
      total_groups: candidateGroups.length,
      candidate_pairs: candidateGroups
    });
  } catch (err: any) {
    console.error('Error finding dedupe candidates:', err);
    res.status(500).json({ error: 'Failed to find duplicate candidates', message: err.message });
  }
};

dedupeRouter.post('/dedupe-candidates', handleDedupeCandidates);
dedupeRouter.get('/dedupe-candidates', handleDedupeCandidates);
