import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { pool } from './client';
import {
  normalizePhone,
  extractEmailDomain,
  normalizeStatus,
  parseDate,
  normalizeNames
} from '../utils/normalizer';

async function seed() {
  console.log('Initializing Database Schema...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);
  console.log('Schema initialized successfully.');

  const csvPath = path.join(__dirname, '../../data/leads_seed.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  console.log('Reading and parsing leads_seed.csv...');
  const fileContent = fs.readFileSync(csvPath, 'utf8');

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`Found ${records.length} records in CSV. Clearing existing data...`);
  await pool.query('TRUNCATE TABLE leads RESTART IDENTITY;');

  console.log('Ingesting leads into PostgreSQL...');

  const insertQuery = `
    INSERT INTO leads (
      record_id, first_name, last_name, full_name, job_title, company_name,
      email, phone_number, country_region, city, lead_status, lifecycle_stage,
      original_source, original_source_drilldown, contact_owner, create_date,
      last_modified_date, notes, annual_revenue, marketing_contact_status,
      gdpr_consent, lead_score, phone_normalized, email_domain
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24
    )
  `;

  let count = 0;
  for (const row of records) {
    const recordId = row['Record ID'] || null;
    const rawFirstName = row['First Name'] || null;
    const rawLastName = row['Last Name'] || null;
    const rawFullName = row['Full Name'] || null;
    const { firstName, lastName, fullName } = normalizeNames(rawFirstName, rawLastName, rawFullName);

    const jobTitle = row['Job Title'] || null;
    const companyName = row['Company Name'] || null;
    const email = row['Email'] ? row['Email'].trim() : null;
    const phoneNumber = row['Phone Number'] ? row['Phone Number'].trim() : null;
    const countryRegion = row['Country/Region'] ? row['Country/Region'].trim() : null;
    const city = row['City'] ? row['City'].trim() : null;
    const leadStatus = normalizeStatus(row['Lead Status']);
    const lifecycleStage = row['Lifecycle Stage'] ? row['Lifecycle Stage'].trim() : null;
    const originalSource = row['Original Source'] ? row['Original Source'].trim() : null;
    const originalSourceDrilldown = row['Original Source Drill-Down 1'] ? row['Original Source Drill-Down 1'].trim() : null;
    const contactOwner = row['Contact Owner'] ? row['Contact Owner'].trim() : null;
    const createDate = parseDate(row['Create Date']);
    const lastModifiedDate = parseDate(row['Last Modified Date']);
    const notes = row['Notes'] ? row['Notes'].trim() : null;
    const annualRevenue = row['Annual Revenue'] || null;
    const marketingContactStatus = row['Marketing contact status'] || null;
    const gdprConsent = row['GDPR consent'] || null;
    const leadScore = row['Lead Score'] ? parseInt(row['Lead Score'], 10) || null : null;

    const phoneNormalized = normalizePhone(phoneNumber);
    const emailDomain = extractEmailDomain(email);

    await pool.query(insertQuery, [
      recordId, firstName, lastName, fullName, jobTitle, companyName,
      email, phoneNumber, countryRegion, city, leadStatus, lifecycleStage,
      originalSource, originalSourceDrilldown, contactOwner, createDate,
      lastModifiedDate, notes, annualRevenue, marketingContactStatus,
      gdprConsent, leadScore, phoneNormalized, emailDomain
    ]);

    count++;
    if (count % 500 === 0) {
      console.log(`Processed ${count}/${records.length} records...`);
    }
  }

  console.log(`Ingested ${count} leads successfully!`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
