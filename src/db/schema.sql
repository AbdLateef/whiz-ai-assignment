CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    record_id VARCHAR(50),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    full_name VARCHAR(255),
    job_title VARCHAR(255),
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone_number VARCHAR(255),
    country_region VARCHAR(255),
    city VARCHAR(255),
    lead_status VARCHAR(100),
    lifecycle_stage VARCHAR(100),
    original_source VARCHAR(255),
    original_source_drilldown VARCHAR(255),
    contact_owner VARCHAR(255),
    create_date TIMESTAMP WITH TIME ZONE,
    last_modified_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    annual_revenue VARCHAR(100),
    marketing_contact_status VARCHAR(100),
    gdpr_consent VARCHAR(100),
    lead_score INT,
    
    -- Helper normalized fields for candidate blocking & search
    phone_normalized VARCHAR(100),
    email_domain VARCHAR(255),
    
    -- AI Source Extraction fields
    extracted_channel VARCHAR(100),
    extracted_detail TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & blocking
CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON leads (lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_contact_owner ON leads (contact_owner);
CREATE INDEX IF NOT EXISTS idx_leads_country ON leads (country_region);
CREATE INDEX IF NOT EXISTS idx_leads_phone_norm ON leads (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_leads_email_domain ON leads (email_domain);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_full_name ON leads USING gin (full_name gin_trgm_ops);
