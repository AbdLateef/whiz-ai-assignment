import { query } from '../db/client';
import {
  normalizePhone,
  extractEmailDomain,
  normalizeStatus,
  parseDate,
  normalizeNames
} from '../utils/normalizer';

export interface LeadFilter {
  status?: string;
  owner?: string;
  country?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface IngestPayload {
  form_id?: string;
  form_name?: string;
  page_url?: string;
  submitted_at?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  country?: string;
  message?: string;
}

export class LeadService {
  static async getLeads(filter: LeadFilter) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 50));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filter.status) {
      whereClauses.push(`LOWER(lead_status) = LOWER($${paramIdx++})`);
      params.push(filter.status.trim());
    }

    if (filter.owner) {
      whereClauses.push(`LOWER(contact_owner) LIKE LOWER($${paramIdx++})`);
      params.push(`%${filter.owner.trim()}%`);
    }

    if (filter.country) {
      whereClauses.push(`LOWER(country_region) = LOWER($${paramIdx++})`);
      params.push(filter.country.trim());
    }

    if (filter.q) {
      const searchTerm = `%${filter.q.trim()}%`;
      whereClauses.push(`(
        LOWER(full_name) LIKE LOWER($${paramIdx}) OR
        LOWER(first_name) LIKE LOWER($${paramIdx}) OR
        LOWER(last_name) LIKE LOWER($${paramIdx}) OR
        LOWER(company_name) LIKE LOWER($${paramIdx}) OR
        LOWER(email) LIKE LOWER($${paramIdx})
      )`);
      paramIdx++;
      params.push(searchTerm);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM leads ${whereSql}`, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    const querySql = `
      SELECT * FROM leads 
      ${whereSql} 
      ORDER BY id ASC 
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    const dataParams = [...params, limit, offset];
    const dataRes = await query(querySql, dataParams);

    return {
      data: dataRes.rows,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  static async getLeadById(id: number) {
    const res = await query('SELECT * FROM leads WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  static async updateLead(id: number, updates: { lead_status?: string; contact_owner?: string; notes?: string }) {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (updates.lead_status !== undefined) {
      fields.push(`lead_status = $${paramIdx++}`);
      params.push(normalizeStatus(updates.lead_status));
    }

    if (updates.contact_owner !== undefined) {
      fields.push(`contact_owner = $${paramIdx++}`);
      params.push(updates.contact_owner);
    }

    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIdx++}`);
      params.push(updates.notes);
    }

    if (fields.length === 0) {
      return this.getLeadById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `
      UPDATE leads 
      SET ${fields.join(', ')} 
      WHERE id = $${paramIdx} 
      RETURNING *
    `;
    const res = await query(sql, params);
    return res.rows[0] || null;
  }

  static async ingestSubmission(payload: IngestPayload) {
    const { name, email, phone, company, country, message, submitted_at, form_name } = payload;

    const emailClean = email ? email.trim().toLowerCase() : null;
    const phoneNorm = normalizePhone(phone);
    const domain = extractEmailDomain(emailClean);
    const { firstName, lastName, fullName } = normalizeNames(null, null, name || null);
    const createDate = parseDate(submitted_at) || new Date();

    // Try to find existing lead by exact email or normalized phone
    let existingLead: any = null;
    if (emailClean) {
      const res = await query('SELECT * FROM leads WHERE LOWER(email) = $1 LIMIT 1', [emailClean]);
      if (res.rows.length > 0) existingLead = res.rows[0];
    }

    if (!existingLead && phoneNorm) {
      const res = await query('SELECT * FROM leads WHERE phone_normalized = $1 LIMIT 1', [phoneNorm]);
      if (res.rows.length > 0) existingLead = res.rows[0];
    }

    const noteEntry = message
      ? `[Form Submission ${submitted_at || ''} (${form_name || 'Web'})]: ${message}`
      : null;

    if (existingLead) {
      // Append note if message present
      const newNotes = existingLead.notes
        ? (noteEntry ? `${existingLead.notes}\n${noteEntry}` : existingLead.notes)
        : noteEntry;

      const updateRes = await query(
        `UPDATE leads SET 
          notes = $1, 
          company_name = COALESCE(company_name, $2),
          country_region = COALESCE(country_region, $3),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 RETURNING *`,
        [newNotes, company || null, country || null, existingLead.id]
      );

      return {
        action: 'updated',
        lead: updateRes.rows[0]
      };
    } else {
      // Create new lead
      const insertSql = `
        INSERT INTO leads (
          first_name, last_name, full_name, company_name, email, phone_number,
          country_region, lead_status, create_date, notes, phone_normalized, email_domain,
          original_source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *
      `;

      const insertRes = await query(insertSql, [
        firstName, lastName, fullName, company || null, emailClean, phone || null,
        country || null, 'New', createDate, noteEntry, phoneNorm, domain,
        'Website'
      ]);

      return {
        action: 'created',
        lead: insertRes.rows[0]
      };
    }
  }

  static async getDashboardMetrics() {
    const statusRes = await query(`
      SELECT lead_status as status, COUNT(*) as count 
      FROM leads 
      GROUP BY lead_status 
      ORDER BY count DESC
    `);

    const channelRes = await query(`
      SELECT 
        COALESCE(extracted_channel, original_source, 'Unassigned') as channel, 
        COUNT(*) as count 
      FROM leads 
      GROUP BY channel 
      ORDER BY count DESC
    `);

    return {
      leads_by_status: statusRes.rows.map(r => ({ status: r.status, count: parseInt(r.count, 10) })),
      leads_by_channel: channelRes.rows.map(r => ({ channel: r.channel, count: parseInt(r.count, 10) }))
    };
  }
}
