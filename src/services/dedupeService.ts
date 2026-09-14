import { query } from '../db/client';
import { AIService, DedupeComparisonResult } from './aiService';

export interface DedupeCandidateGroup {
  confidence: number;
  reasoning: string;
  lead1: any;
  lead2: any;
}

export class DedupeService {
  /**
   * Find likely-duplicate lead candidates using candidate generation (blocking)
   * followed by AI/heuristic pairwise scoring.
   */
  static async findDuplicateCandidates(limit: number = 30): Promise<DedupeCandidateGroup[]> {
    // Stage 1: Candidate Generation (Blocking) via SQL queries
    
    // Blocking Rule 1: Same normalized phone number
    const phoneCandidatesRes = await query(`
      SELECT l1.id as id1, l2.id as id2
      FROM leads l1
      JOIN leads l2 ON l1.phone_normalized = l2.phone_normalized AND l1.id < l2.id
      WHERE l1.phone_normalized IS NOT NULL AND l1.phone_normalized != ''
      LIMIT 100
    `);

    // Blocking Rule 2: Same email or same email localpart / domain with matching company
    const emailDomainCandidatesRes = await query(`
      SELECT l1.id as id1, l2.id as id2
      FROM leads l1
      JOIN leads l2 ON l1.email_domain = l2.email_domain AND l1.id < l2.id
      WHERE l1.email_domain IS NOT NULL 
        AND l1.email_domain NOT IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com')
        AND (
          LOWER(l1.last_name) = LOWER(l2.last_name) OR
          LOWER(SPLIT_PART(l1.email, '@', 1)) = LOWER(SPLIT_PART(l2.email, '@', 1)) OR
          SIMILARITY(l1.company_name, l2.company_name) > 0.4
        )
      LIMIT 100
    `);

    // Blocking Rule 3: Trigram similarity on company name and full name
    const fuzzyCandidatesRes = await query(`
      SELECT l1.id as id1, l2.id as id2
      FROM leads l1
      JOIN leads l2 ON l1.id < l2.id
      WHERE SIMILARITY(l1.company_name, l2.company_name) > 0.6
        AND SIMILARITY(COALESCE(l1.full_name, l1.last_name, ''), COALESCE(l2.full_name, l2.last_name, '')) > 0.5
      LIMIT 100
    `);

    // Combine candidate pairs and remove duplicates
    const candidatePairSet = new Set<string>();
    const candidatePairs: [number, number][] = [];

    const addPair = (id1: number, id2: number) => {
      const key = `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;
      if (!candidatePairSet.has(key)) {
        candidatePairSet.add(key);
        candidatePairs.push([Math.min(id1, id2), Math.max(id1, id2)]);
      }
    };

    phoneCandidatesRes.rows.forEach(r => addPair(parseInt(r.id1, 10), parseInt(r.id2, 10)));
    emailDomainCandidatesRes.rows.forEach(r => addPair(parseInt(r.id1, 10), parseInt(r.id2, 10)));
    fuzzyCandidatesRes.rows.forEach(r => addPair(parseInt(r.id1, 10), parseInt(r.id2, 10)));

    const selectedPairs = candidatePairs.slice(0, limit);
    if (selectedPairs.length === 0) {
      return [];
    }

    // Batch fetch all lead records involved in candidate pairs
    const allLeadIds = Array.from(new Set(selectedPairs.flatMap(([id1, id2]) => [id1, id2])));
    const leadsRes = await query(
      `SELECT * FROM leads WHERE id = ANY($1::int[])`,
      [allLeadIds]
    );

    const leadMap = new Map<number, any>();
    leadsRes.rows.forEach(row => leadMap.set(row.id, row));

    // Stage 2: Perform AI/heuristic pairwise comparison
    const evalPromises = selectedPairs.map(async ([id1, id2]) => {
      const lead1 = leadMap.get(id1);
      const lead2 = leadMap.get(id2);

      if (!lead1 || !lead2) return null;

      const evalResult: DedupeComparisonResult = await AIService.compareLeads(lead1, lead2);

      if (evalResult.is_duplicate) {
        return {
          confidence: evalResult.confidence,
          reasoning: evalResult.reasoning,
          lead1,
          lead2
        };
      }

      return null;
    });

    const evaluated = await Promise.all(evalPromises);
    const results: DedupeCandidateGroup[] = evaluated.filter((item): item is DedupeCandidateGroup => item !== null);

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }
}
