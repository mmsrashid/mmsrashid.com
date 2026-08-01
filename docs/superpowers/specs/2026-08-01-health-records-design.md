# Health Records Module — Design Spec

**Date:** 2026-08-01  
**Status:** Approved for implementation

---

## Overview

A full health records dashboard at `/dashboard/health`. Mimics the Epic MyChart structure: 6 top-level tabs accessed via an icon nav bar. JARVIS AI sidebar is always present (slides in/out). The module owns its own Supabase tables under the `health_` prefix.

---

## Navigation Structure

Six tabs in this order:

| # | Tab | Icon | Description |
|---|-----|------|-------------|
| 1 | Home | 🏠 | Overview dashboard — flagged markers, next appt, unread messages, medicines at-a-glance |
| 2 | Appointments | 📅 | List of past/upcoming appointments, add/edit |
| 3 | Messages | 💬 | Health-related emails filtered from connected Zoho inbox |
| 4 | Medicines | 💊 | Current and past medications with dosage |
| 5 | Test Results | 🩸 | Blood panel: category accordion + search + per-marker drill-down |
| 6 | Documents | 📄 | PDF upload + document library (letters, results, scans, prescriptions) |

---

## JARVIS Sidebar

- Fixed to left side of all health pages, width 270px, collapses to 44px icon strip
- Dark background (#111) matching existing JarvisOrb style
- Chat interface: scrollable message history + text input
- Health-aware system prompt includes: recent flagged markers, upcoming appointments, unread message count, current medicines
- Uses existing `/api/jarvis` SSE endpoint — passes `context: 'health'` flag in request body to inject health summary

---

## Tab Designs

### 1. Home Tab

Four stat tiles (appointments count, unread messages, flagged markers, active medicines) — each clickable, routes to that tab.

Alert banner: surfaces the single most urgent flagged marker (highest deviation from range).

Two-column card grid:
- **Next appointment** — date tile, doctor name, location, countdown pill
- **Flagged markers** — top 3 out-of-range markers, sparkline per marker, High/Low badge
- **Recent health messages** — top 3 emails, unread dot
- **Current medicines** — top 3 active medications

### 2. Appointments Tab

List view, newest upcoming first, then past. Each row: date tile, appointment name, doctor, location, status badge (Upcoming / Completed / Cancelled). "Add appointment" button top-right opens a form modal (no external calendar sync required).

Fields: date, time, appointment type, doctor name, clinic/hospital name, notes.

### 3. Messages Tab

Pulls from the existing Zoho IMAP connection (`lib/email.ts → listMessages()`). Filters to health-related senders using keyword matching on sender domain and subject (e.g. NHS, hospital, GP, clinic, prescription, referral, blood, results).

Two-pane layout: message list on left (sender avatar, subject, date, unread dot), message body on right. No send capability required (read-only).

### 4. Medicines Tab

Table: Name | Dose | Frequency | Start Date | Status (Active / Stopped) | Notes. Row click expands inline detail. "Add medicine" button opens modal.

Fields: name, dose, unit (mg/mcg/IU/ml/units), frequency, route (oral/topical/inhaled), start date, end date (optional), prescribing doctor, notes.

### 5. Test Results — Blood Panel

**Overview page** (`/dashboard/health/blood`):
- Search bar filters live across all marker names
- Category accordion (collapsed by default, flagged groups auto-expand)
- Category groups: Full Blood Count, Liver Function, Thyroid, Lipids, Metabolic, Vitamins & Minerals, Hormones, Inflammatory, Sleep, Nutrition, Exercise, Other
- Each group row shows: category name, marker count, last test date, flag count badge
- Inside each group: one row per marker — name, latest value + unit, sparkline (last 5 results), trend arrow, status badge (Normal / High / Low / Borderline)

**Per-marker detail page** (`/dashboard/health/blood/[marker]`):
- Hero: marker name, latest value, unit, reference range, High/Low/Normal status
- SVG trend chart: x-axis = dates, y-axis = value, green band = normal range, data points coloured (green=normal, amber=borderline, red=out-of-range)
- Results data table: Date | Value | Unit | Reference Range | Status | Lab | Notes
- Improvement card: 4 sections — Diet, Exercise, Medications, Lifestyle — plus "Questions to ask your GP"
- Back link to blood overview

**PDF Upload**:
- Drop zone on blood overview page
- Upload PDF to Supabase Storage bucket `health-documents`
- Call Claude (claude-haiku-4-5-20251001) via API to extract markers from PDF text
- Extracted markers shown in a review modal before saving — user can correct values
- On confirm, insert into `health_blood_results`

### 6. Documents Tab

Grid view of uploaded documents. Filter pills: All / Blood Results / Letters / Scans / Prescriptions.

Document card: icon (colour-coded by type), document name, upload date, file size, auto-extracted tags (e.g. "18 markers extracted", doctor name).

Drop zone at top for new uploads. File types: PDF only. Max size: 20MB.

JARVIS auto-reads newly uploaded documents and can answer questions about their content.

---

## Data Model

### `supabase/migrations/004_health.sql`

```sql
-- Appointments
create table health_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_date timestamptz not null,
  appointment_type text not null,
  doctor_name text,
  clinic_name text,
  status text not null default 'upcoming' check (status in ('upcoming','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- Medicines
create table health_medicines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose numeric,
  dose_unit text,
  frequency text,
  route text,
  start_date date,
  end_date date,
  prescribing_doctor text,
  status text not null default 'active' check (status in ('active','stopped')),
  notes text,
  created_at timestamptz not null default now()
);

-- Blood markers (static catalogue of known markers)
create table health_blood_markers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  category text not null,
  unit text,
  ref_low numeric,
  ref_high numeric,
  description text
);

-- Blood results (individual test readings)
create table health_blood_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marker_id uuid not null references health_blood_markers(id),
  value numeric not null,
  test_date date not null,
  lab_name text,
  document_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- Documents
create table health_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('blood_result','letter','scan','prescription','other')),
  storage_path text not null,
  file_size_bytes bigint,
  extracted_marker_count int default 0,
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

-- RLS on all tables
alter table health_appointments enable row level security;
alter table health_medicines enable row level security;
alter table health_blood_markers enable row level security;
alter table health_blood_results enable row level security;
alter table health_documents enable row level security;

create policy "own appointments" on health_appointments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own medicines" on health_medicines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "read markers" on health_blood_markers for select using (true);
create policy "own results" on health_blood_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own documents" on health_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Seed `health_blood_markers` with the 50+ standard biomarkers at migration time.

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health/appointments` | GET, POST | List / create appointments |
| `/api/health/medicines` | GET, POST | List / create medicines |
| `/api/health/blood/results` | GET, POST | List results (grouped by marker) / add result |
| `/api/health/blood/markers` | GET | List all markers with latest user result |
| `/api/health/blood/extract` | POST | Upload PDF, extract markers via Claude |
| `/api/health/documents` | GET, POST | List / create document records |
| `/api/health/messages` | GET | Fetch + filter health emails from IMAP |

---

## File Structure

```
app/(dashboard)/dashboard/health/
  layout.tsx                    # JARVIS sidebar + tab nav shell
  page.tsx                      # Redirects to /home
  home/page.tsx                 # Home tab
  appointments/page.tsx         # Appointments tab
  messages/page.tsx             # Messages tab
  medicines/page.tsx            # Medicines tab
  blood/page.tsx                # Blood overview (accordion + search)
  blood/[marker]/page.tsx       # Per-marker detail page
  documents/page.tsx            # Documents tab

app/api/health/
  appointments/route.ts
  medicines/route.ts
  blood/results/route.ts
  blood/markers/route.ts
  blood/extract/route.ts
  documents/route.ts
  messages/route.ts

components/health/
  HealthShell.tsx               # Sidebar + nav (client component)
  HealthJarvisSidebar.tsx       # JARVIS chat sidebar, health context
  BloodAccordion.tsx            # Category accordion with search
  BloodMarkerRow.tsx            # Single marker row with sparkline
  BloodTrendChart.tsx           # SVG trend chart for marker detail
  ImprovementCard.tsx           # Diet/Exercise/Medications/Lifestyle card
  AppointmentModal.tsx          # Add/edit appointment form
  MedicineModal.tsx             # Add/edit medicine form
  DocumentUploadZone.tsx        # PDF drop zone + extraction flow
  ExtractReviewModal.tsx        # Review extracted markers before saving

lib/health/
  blood-markers-seed.ts         # Array of 50+ standard biomarkers
  pdf-extract.ts                # Claude call to extract markers from PDF text

supabase/migrations/
  004_health.sql
```
