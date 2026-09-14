import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/client';

jest.setTimeout(30000);

afterAll(async () => {
  await pool.end();
});

describe('Lead Management REST API', () => {
  test('GET /health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /leads returns paginated leads list', async () => {
    const res = await request(app).get('/leads?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });

  test('GET /leads with filters (status and q search)', async () => {
    const res = await request(app).get('/leads?status=Qualified&q=Singh');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const lead of res.body.data) {
      expect(lead.lead_status.toLowerCase()).toBe('qualified');
    }
  });

  test('GET /leads/:id returns single lead detail', async () => {
    const listRes = await request(app).get('/leads?limit=1');
    const firstLead = listRes.body.data[0];

    const res = await request(app).get(`/leads/${firstLead.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(firstLead.id);
    expect(res.body.email).toBe(firstLead.email);
  });

  test('PATCH /leads/:id updates lead status, owner, or notes', async () => {
    const listRes = await request(app).get('/leads?limit=1');
    const firstLead = listRes.body.data[0];

    const patchRes = await request(app)
      .patch(`/leads/${firstLead.id}`)
      .send({
        lead_status: 'Closed Won',
        contact_owner: 'Test Suite Owner',
        notes: 'Updated via integration test'
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.lead_status).toBe('Closed Won');
    expect(patchRes.body.contact_owner).toBe('Test Suite Owner');
    expect(patchRes.body.notes).toBe('Updated via integration test');
  });

  test('GET /leads/export streams CSV file', async () => {
    const res = await request(app).get('/leads/export?limit=5');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('text/csv');
    expect(res.text).toContain('ID,Record ID,First Name');
  });

  test('POST /leads/ingest ingests a webform submission and creates/updates lead', async () => {
    const testId = Date.now();
    const uniqueEmail = `test.integration.${testId}@testcompany.io`;
    const uniquePhone = `+1 555 ${Math.floor(1000000 + Math.random() * 9000000)}`;

    const payload = {
      form_id: "form_test",
      form_name: "Test Form",
      submitted_at: new Date().toISOString(),
      name: "Integration Test User",
      email: uniqueEmail,
      phone: uniquePhone,
      company: "Test Company Inc",
      country: "United States",
      message: "Looking for pricing details."
    };

    const res = await request(app).post('/leads/ingest').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].action).toBe('created');
    expect(res.body.results[0].lead.email).toBe(uniqueEmail);

    // Ingesting again should trigger update instead of create
    const resUpdate = await request(app).post('/leads/ingest').send(payload);
    expect(resUpdate.status).toBe(201);
    expect(resUpdate.body.results[0].action).toBe('updated');
  });

  test('GET /dashboard returns lead metrics by status and channel', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('leads_by_status');
    expect(res.body).toHaveProperty('leads_by_channel');
    expect(Array.isArray(res.body.leads_by_status)).toBe(true);
    expect(Array.isArray(res.body.leads_by_channel)).toBe(true);
  });

  test('POST /leads/dedupe-candidates returns ranked candidate groups', async () => {
    const res = await request(app).post('/leads/dedupe-candidates').send({ limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_groups');
    expect(res.body).toHaveProperty('candidate_pairs');
    expect(Array.isArray(res.body.candidate_pairs)).toBe(true);
  });
});
