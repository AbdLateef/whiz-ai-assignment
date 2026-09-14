# AI-Assisted Mini Lead Management System (Submission)

An internal lead management backend service built with **Node.js**, **Express**, **TypeScript**, and **PostgreSQL**, integrated with **OpenAI (`gpt-4o-mini`)** for intelligent lead deduplication and source channel extraction.

---

## Quick Start

### 1. Prerequisites
- **Node.js** (v20+ recommended)
- **PostgreSQL** running locally on port 5432 (or set `DATABASE_URL` in `.env`)

### 2. Installation
```bash
# Install dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your PostgreSQL connection string and OpenAI API key:
```env
PORT=3000
DATABASE_URL=postgresql://postgres@localhost:5432/wiz_leads_db
OPENAI_API_KEY=sk-proj-...
```

### 4. Database Setup & Data Ingestion
Run the seed script to create the database schema, apply normalization, and import `data/leads_seed.csv` (~2,049 records):
```bash
npm run seed
```

### 5. Running the Application
```bash
# Start development server
npm run dev

# Or build & start production server
npm run build
npm start
```
The server will start at `http://localhost:3000`.

### 6. Running Automated Tests
```bash
npm test
```

---

## API Documentation

### Core Lead Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/leads` | List leads. Query params: `status`, `owner`, `country`, `q` (free-text search), `page`, `limit` |
| `GET` | `/leads/:id` | Get single lead detail |
| `PATCH` | `/leads/:id` | Update lead fields (`lead_status`, `contact_owner`, `notes`) |
| `GET` | `/leads/export` | Download CSV export of filtered leads |
| `POST` | `/leads/ingest` | Ingest webform submission JSON payload. Automatically creates new lead or updates existing lead by phone/email match. |

### AI-Powered Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/leads/dedupe-candidates` | AI-assisted lead deduplication: returns ranked candidate pairs with confidence scores & reasoning |
| `POST` | `/leads/:id/extract-source` | Extract structured lead channel & detail from free-text `Notes` using LLM |
| `POST` | `/leads/extract-source-batch` | Batch process source extraction for leads with notes |
| `GET` | `/dashboard` | Metrics endpoint returning lead counts grouped by status and source channel |

---

### Sample API Responses

#### 1. AI Lead Deduplication (`POST /leads/dedupe-candidates`)
```json
{
  "total_groups": 5,
  "candidate_pairs": [
    {
      "confidence": 0.95,
      "reasoning": "Both leads have the same name, phone number, and similar email domains, indicating they likely represent the same individual despite a slight variation in the company name.",
      "lead1": {
        "id": 1886,
        "full_name": "Fatima Romano",
        "company_name": "Choi Logistics Freight Solutions",
        "email": "fatimar@choilogistics.net",
        "phone_number": "+1 287 555 0139"
      },
      "lead2": {
        "id": 1887,
        "full_name": "Fatima Romano",
        "company_name": "Choi Logistics Freight Consulting",
        "email": "f.romano@choilogistics.net",
        "phone_number": "+1 287 555 0139"
      }
    },
    {
      "confidence": 0.95,
      "reasoning": "Both leads share the same email address and phone number, and the names are variations of the same individual. The company names are similar enough to suggest they refer to the same entity, indicating they are likely the same individual.",
      "lead1": {
        "id": 24,
        "full_name": "Joon Diallo",
        "company_name": "Huang Analytics and Co",
        "email": "joond@huanganalytics.co",
        "phone_number": "+1 323 555 0192"
      },
      "lead2": {
        "id": 25,
        "full_name": "J. Diallo",
        "company_name": "Huang Analytics and Pte. Ltd.",
        "email": "joond@huanganalytics.co",
        "phone_number": "+1 323 555 0192"
      }
    }
  ]
}
```

#### 2. AI Source Extraction (`POST /leads/1/extract-source`)
```json
{
  "lead_id": 1,
  "extraction": {
    "channel": "Event",
    "detail": "SaaStr Annual booth QR code scan"
  }
}
```

---

## Design Decisions & Technical Architecture

### 1. Scalable AI Lead Deduplication Strategy
Running an LLM call across all pair combinations of 2,000 leads would require ~2,000² / 2 = **~2 million LLM API calls**, which is computationally intractable, extremely slow, and expensive.

To solve this, we implemented a **2-Stage Deduplication Architecture**:

1. **Stage 1: Scalable Candidate Generation (Blocking & Pre-filtering)**
   - **Phone Digits Blocking**: Matches records sharing normalized digits-only phone numbers (e.g., `+86 138 2424 7912` vs `8613824247912`).
   - **Email Domain & Localpart Blocking**: Matches records sharing corporate email domains + similar last names or company names.
   - **Trigram Similarity Blocking**: Uses PostgreSQL `pg_trgm` GIN indexes to quickly find fuzzy string matches on `company_name` and `full_name`.
   - *Result*: Narrows 2,000 records (~2M pairs) down to **top ~50–150 high-probability candidate pairs**.

2. **Stage 2: Pairwise LLM Reasoning (`gpt-4o-mini`)**
   - Candidate pairs are passed to OpenAI `gpt-4o-mini` with a structured prompt and JSON Schema response format.
   - The LLM analyzes subtle details (matching corporate entity suffixes, typos in names, booth notes) and outputs:
     - `is_duplicate`: `boolean`
     - `confidence`: `float` (0.0 to 1.0)
     - `reasoning`: Concise explanation of *why* they match or differ.
   - *Fallback*: Built-in heuristic fallback scorer in case of offline/missing API keys.

---

### 2. AI Source Extraction Strategy
- Real CRM notes contain messy narrative text (e.g. *"Met him at the SaaStr Annual booth, scanned our QR code"* or *"Googled us and ended up on book-a-demo page"*).
- We use `gpt-4o-mini` with **Structured JSON Output** to extract:
  - `channel`: Restricted strictly to `Website`, `Event`, `LinkedIn`, `Organic Search`, `Referral`, `Manual/Sales`, `Other`.
  - `detail`: Specific context extracted from text.

---

### 3. Data Normalization & Messy CRM Ingestion
When importing `data/leads_seed.csv` and ingesting form submissions:
- **Phone Numbers**: Non-digit characters are stripped into `phone_normalized` for fast indexed matching.
- **Dates**: Mixed formats (`12/21/2025`, `2026-05-24`, `2025-10-27T00:00:00Z`) are parsed into ISO timestamps.
- **Statuses**: Normalizes casing and whitespace (`" Qualified "` → `"Qualified"`, `"closed won"` → `"Closed Won"`).
- **Names**: Handles cases where only `Full Name` is provided vs separate `First Name` / `Last Name`.

---

## LLM Usage & Cost Estimation
- **Provider**: OpenAI
- **Model**: `gpt-4o-mini`
- **Cost**: `gpt-4o-mini` costs $0.15 / 1M input tokens and $0.60 / 1M output tokens.
- **Estimated Total Cost for full seed dataset run**: **< $0.05 USD** total.

---

## What I'd Do Next (Given More Time)
1. **Interactive Deduplication UI**: Build a lightweight frontend interface allowing sales managers to review candidate pairs side-by-side and execute automated record merges.
2. **Vector Embeddings Indexing**: Implement `pgvector` or HNSW index on lead company + bio embeddings for sub-millisecond candidate retrieval at 100k+ lead scale.
3. **Webhook Notifications**: Trigger real-time notifications (Slack/Email) when high-value leads submit form entries or duplicate candidates are detected.
4. **Deduplication Result Caching Table (`duplicate_candidates`)**: To optimize OpenAI API costs and prevent re-evaluating identical candidate pairs on every request, store AI evaluation outputs in a persistent PostgreSQL table (`duplicate_candidates`) with review status flags (`PENDING_REVIEW`, `MERGED`, `DISMISSED`). This ensures AI is only invoked for un-evaluated leads while keeping repeated queries at $0 cost.

---
