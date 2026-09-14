import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export interface DedupeComparisonResult {
  is_duplicate: boolean;
  confidence: number;
  reasoning: string;
}

export interface SourceExtractionResult {
  channel: 'Website' | 'Event' | 'LinkedIn' | 'Organic Search' | 'Referral' | 'Manual/Sales' | 'Other';
  detail: string;
}

export class AIService {
  /**
   * Evaluate whether two candidate leads are duplicate entries of the same person.
   */
  static async compareLeads(lead1: any, lead2: any): Promise<DedupeComparisonResult> {
    if (!openai) {
      // Fallback heuristic scoring if no OpenAI API Key provided
      return this.heuristicDedupeCompare(lead1, lead2);
    }

    try {
      const prompt = `
You are an expert CRM data deduplication assistant. Analyze these two lead entries from a sales database and determine if they represent the SAME INDIVIDUAL or DIFFERENT INDIVIDUALS.

Lead A:
- Record ID: ${lead1.record_id || lead1.id}
- Name: ${lead1.full_name || `${lead1.first_name || ''} ${lead1.last_name || ''}`}
- Company: ${lead1.company_name || 'N/A'}
- Email: ${lead1.email || 'N/A'}
- Phone: ${lead1.phone_number || 'N/A'}
- Country: ${lead1.country_region || 'N/A'}
- Notes: ${lead1.notes || 'N/A'}

Lead B:
- Record ID: ${lead2.record_id || lead2.id}
- Name: ${lead2.full_name || `${lead2.first_name || ''} ${lead2.last_name || ''}`}
- Company: ${lead2.company_name || 'N/A'}
- Email: ${lead2.email || 'N/A'}
- Phone: ${lead2.phone_number || 'N/A'}
- Country: ${lead2.country_region || 'N/A'}
- Notes: ${lead2.notes || 'N/A'}

Respond strictly in JSON format:
{
  "is_duplicate": boolean,
  "confidence": number (between 0.00 and 1.00),
  "reasoning": "Concise 1-2 sentence explanation of why they are or are not duplicates (e.g. matching phone number and corporate domain, or different individuals at same company)."
}
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an AI lead deduplication engine. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });

      const content = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);
      return {
        is_duplicate: Boolean(parsed.is_duplicate),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        reasoning: parsed.reasoning || 'Identified similarity across key profile attributes.'
      };
    } catch (err) {
      console.warn('OpenAI API call failed for dedupe, falling back to heuristic:', err);
      return this.heuristicDedupeCompare(lead1, lead2);
    }
  }

  /**
   * Extract source channel and detail from raw lead Notes text.
   */
  static async extractSourceFromNotes(notes: string): Promise<SourceExtractionResult> {
    if (!notes || !notes.trim()) {
      return { channel: 'Other', detail: 'No notes provided' };
    }

    if (!openai) {
      return this.heuristicSourceExtract(notes);
    }

    try {
      const prompt = `
Extract the lead generation channel and specific detail from the following sales note:

Note: "${notes}"

Rules for "channel":
Channel MUST be strictly one of:
- "Website" (e.g. form submission, downloaded ebook, pricing page)
- "Event" (e.g. trade show, booth, QR code scan, conference)
- "LinkedIn" (e.g. direct message, commented on post, LinkedIn outreach)
- "Organic Search" (e.g. googled us, landed on homepage)
- "Referral" (e.g. referred by warm intro)
- "Manual/Sales" (e.g. cold outreach list, phone call added manually)
- "Other" (e.g. walked into office, info@ inbox)

Respond strictly in JSON format:
{
  "channel": "Website" | "Event" | "LinkedIn" | "Organic Search" | "Referral" | "Manual/Sales" | "Other",
  "detail": "Specific short detail extracted from note (e.g., 'Singapore FinTech Festival 2026 — Booth QR Code')"
}
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an AI lead source extraction engine. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });

      const content = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);

      const validChannels = ['Website', 'Event', 'LinkedIn', 'Organic Search', 'Referral', 'Manual/Sales', 'Other'];
      const channel = validChannels.includes(parsed.channel) ? parsed.channel : 'Other';

      return {
        channel: channel as any,
        detail: parsed.detail || notes.slice(0, 100)
      };
    } catch (err) {
      console.warn('OpenAI API call failed for source extraction, falling back to heuristic:', err);
      return this.heuristicSourceExtract(notes);
    }
  }

  /**
   * Fallback heuristic dedup logic
   */
  private static heuristicDedupeCompare(l1: any, l2: any): DedupeComparisonResult {
    let score = 0;
    const reasons: string[] = [];

    if (l1.phone_normalized && l2.phone_normalized && l1.phone_normalized === l2.phone_normalized) {
      score += 0.5;
      reasons.push('Identical normalized phone number');
    }

    if (l1.email && l2.email && l1.email.toLowerCase() === l2.email.toLowerCase()) {
      score += 0.6;
      reasons.push('Identical email address');
    }

    if (l1.company_name && l2.company_name) {
      const c1 = l1.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const c2 = l2.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (c1.includes(c2) || c2.includes(c1)) {
        score += 0.3;
        reasons.push('Matching company name');
      }
    }

    const isDup = score >= 0.6;
    return {
      is_duplicate: isDup,
      confidence: Math.min(1.0, Math.max(0.3, score)),
      reasoning: reasons.length > 0 ? reasons.join('; ') : 'Low attribute overlap'
    };
  }

  /**
   * Fallback heuristic source extraction logic
   */
  private static heuristicSourceExtract(notes: string): SourceExtractionResult {
    const text = notes.toLowerCase();

    if (text.includes('booth') || text.includes('qr code') || text.includes('event') || text.includes('conference') || text.includes('festival')) {
      return { channel: 'Event', detail: notes };
    }
    if (text.includes('linkedin') || text.includes('dm inbound')) {
      return { channel: 'LinkedIn', detail: notes };
    }
    if (text.includes('google') || text.includes('organic')) {
      return { channel: 'Organic Search', detail: notes };
    }
    if (text.includes('referred') || text.includes('referral') || text.includes('warm intro')) {
      return { channel: 'Referral', detail: notes };
    }
    if (text.includes('form') || text.includes('contact page') || text.includes('book-a-demo')) {
      return { channel: 'Website', detail: notes };
    }
    if (text.includes('manual') || text.includes('cold outreach')) {
      return { channel: 'Manual/Sales', detail: notes };
    }

    return { channel: 'Other', detail: notes };
  }
}
