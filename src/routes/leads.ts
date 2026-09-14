import { Router, Request, Response } from 'express';
import { LeadService } from '../services/leadService';
import { AIService } from '../services/aiService';
import { query } from '../db/client';

export const leadsRouter = Router();

// GET /leads - list leads with filtering and pagination
leadsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, owner, country, q, page, limit } = req.query;

    const result = await LeadService.getLeads({
      status: status as string,
      owner: owner as string,
      country: country as string,
      q: q as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads', message: err.message });
  }
});

// GET /leads/export - CSV export of filtered view
leadsRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, owner, country, q } = req.query;

    const result = await LeadService.getLeads({
      status: status as string,
      owner: owner as string,
      country: country as string,
      q: q as string,
      page: 1,
      limit: 10000
    });

    const leads = result.data;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');

    if (leads.length === 0) {
      res.send('');
      return;
    }

    const headers = [
      'ID', 'Record ID', 'First Name', 'Last Name', 'Full Name', 'Job Title',
      'Company Name', 'Email', 'Phone Number', 'Country/Region', 'City',
      'Lead Status', 'Lifecycle Stage', 'Original Source', 'Contact Owner',
      'Extracted Channel', 'Extracted Detail', 'Notes'
    ];

    const escapeCsvField = (field: any) => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [headers.join(',')];
    for (const lead of leads) {
      const row = [
        lead.id, lead.record_id, lead.first_name, lead.last_name, lead.full_name,
        lead.job_title, lead.company_name, lead.email, lead.phone_number,
        lead.country_region, lead.city, lead.lead_status, lead.lifecycle_stage,
        lead.original_source, lead.contact_owner, lead.extracted_channel,
        lead.extracted_detail, lead.notes
      ].map(escapeCsvField);

      csvRows.push(row.join(','));
    }

    res.send(csvRows.join('\n'));
  } catch (err: any) {
    console.error('Error exporting leads:', err);
    res.status(500).json({ error: 'Failed to export leads', message: err.message });
  }
});

// POST /leads/ingest - Ingest webform submission payload
leadsRouter.post('/ingest', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const resItem = await LeadService.ingestSubmission(item);
      results.push(resItem);
    }

    res.status(201).json({
      message: `Processed ${results.length} submission(s)`,
      results
    });
  } catch (err: any) {
    console.error('Error ingesting submission:', err);
    res.status(500).json({ error: 'Failed to ingest submission', message: err.message });
  }
});

// POST /leads/extract-source-batch - AI source extraction for batch leads
leadsRouter.post('/extract-source-batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.body.limit ? parseInt(req.body.limit, 10) : 10;

    // Select leads with non-empty notes that haven't been extracted yet
    const leadsRes = await query(`
      SELECT id, notes 
      FROM leads 
      WHERE notes IS NOT NULL AND notes != '' AND extracted_channel IS NULL
      LIMIT $1
    `, [limit]);

    const extracted = [];
    for (const lead of leadsRes.rows) {
      const result = await AIService.extractSourceFromNotes(lead.notes);
      await query(
        `UPDATE leads SET extracted_channel = $1, extracted_detail = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [result.channel, result.detail, lead.id]
      );
      extracted.push({ id: lead.id, ...result });
    }

    res.json({
      message: `Extracted channel & detail for ${extracted.length} lead(s)`,
      extracted
    });
  } catch (err: any) {
    console.error('Error in batch source extraction:', err);
    res.status(500).json({ error: 'Failed batch source extraction', message: err.message });
  }
});

// POST /leads/:id/extract-source - AI source extraction for a single lead
leadsRouter.post('/:id/extract-source', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const lead = await LeadService.getLeadById(id);

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    if (!lead.notes) {
      res.status(400).json({ error: 'Lead has no notes to extract from' });
      return;
    }

    const extraction = await AIService.extractSourceFromNotes(lead.notes);

    await query(
      `UPDATE leads SET extracted_channel = $1, extracted_detail = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [extraction.channel, extraction.detail, id]
    );

    res.json({
      lead_id: id,
      extraction
    });
  } catch (err: any) {
    console.error('Error extracting lead source:', err);
    res.status(500).json({ error: 'Failed to extract lead source', message: err.message });
  }
});

// GET /leads/:id - Single lead detail
leadsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const lead = await LeadService.getLeadById(id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(lead);
  } catch (err: any) {
    console.error('Error fetching lead detail:', err);
    res.status(500).json({ error: 'Failed to fetch lead detail', message: err.message });
  }
});

// PATCH /leads/:id - Update lead status, owner, or notes
leadsRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const lead = await LeadService.getLeadById(id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const { lead_status, contact_owner, notes } = req.body;
    const updatedLead = await LeadService.updateLead(id, { lead_status, contact_owner, notes });

    res.json(updatedLead);
  } catch (err: any) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: 'Failed to update lead', message: err.message });
  }
});
