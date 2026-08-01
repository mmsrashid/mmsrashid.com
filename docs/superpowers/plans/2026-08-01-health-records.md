# Health Records Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 6-tab health records module at `/dashboard/health` with JARVIS sidebar, blood panel tracking, PDF extraction, and email integration.

**Architecture:** Next.js App Router route group under `(dashboard)/dashboard/health/` with a shared layout that renders the JARVIS sidebar and tab nav. Data lives in Supabase (`health_*` tables). API routes under `/api/health/` handle all mutations. Client components fetch from those routes.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Storage + RLS), Anthropic SDK (claude-haiku-4-5-20251001), ImapFlow (existing), TypeScript, inline SVG for charts.

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/004_health.sql`

- [ ] Create `supabase/migrations/004_health.sql`:

```sql
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

create table health_blood_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marker_id uuid not null references health_blood_markers(id),
  value numeric not null,
  test_date date not null,
  lab_name text,
  document_id uuid references health_documents(id),
  notes text,
  created_at timestamptz not null default now()
);

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

insert into health_blood_markers (name, short_name, category, unit, ref_low, ref_high) values
-- Full Blood Count
('Haemoglobin','Hb','Full Blood Count','g/L',130,170),
('White Blood Cells','WBC','Full Blood Count','x10⁹/L',4,11),
('Platelets','PLT','Full Blood Count','x10⁹/L',150,400),
('Red Blood Cells','RBC','Full Blood Count','x10¹²/L',4.5,5.5),
('Haematocrit','HCT','Full Blood Count','%',40,52),
('MCV','MCV','Full Blood Count','fL',80,100),
('MCH','MCH','Full Blood Count','pg',27,33),
('Neutrophils','Neut','Full Blood Count','x10⁹/L',1.8,7.5),
('Lymphocytes','Lymph','Full Blood Count','x10⁹/L',1,4),
('Monocytes','Mono','Full Blood Count','x10⁹/L',0.2,1),
('Eosinophils','Eos','Full Blood Count','x10⁹/L',0,0.5),
('Basophils','Baso','Full Blood Count','x10⁹/L',0,0.1),
-- Liver Function
('ALT','ALT','Liver Function','U/L',0,45),
('AST','AST','Liver Function','U/L',0,40),
('GGT','GGT','Liver Function','U/L',0,60),
('ALP','ALP','Liver Function','U/L',30,130),
('Bilirubin Total','Bili','Liver Function','µmol/L',0,21),
('Albumin','Alb','Liver Function','g/L',35,50),
('Total Protein','TP','Liver Function','g/L',60,80),
-- Thyroid
('TSH','TSH','Thyroid','mIU/L',0.4,4),
('Free T4','fT4','Thyroid','pmol/L',9,19),
('Free T3','fT3','Thyroid','pmol/L',3.1,6.8),
-- Lipids
('Total Cholesterol','Chol','Lipids','mmol/L',0,5),
('LDL Cholesterol','LDL','Lipids','mmol/L',0,3),
('HDL Cholesterol','HDL','Lipids','mmol/L',1,null),
('Triglycerides','Trig','Lipids','mmol/L',0,1.7),
('Non-HDL Cholesterol','Non-HDL','Lipids','mmol/L',0,4),
-- Metabolic
('Glucose (Fasting)','Gluc','Metabolic','mmol/L',3.9,5.6),
('HbA1c','HbA1c','Metabolic','mmol/mol',0,42),
('Creatinine','Creat','Metabolic','µmol/L',60,110),
('eGFR','eGFR','Metabolic','mL/min/1.73m²',60,null),
('Urea','Urea','Metabolic','mmol/L',2.5,7.8),
('Sodium','Na','Metabolic','mmol/L',135,145),
('Potassium','K','Metabolic','mmol/L',3.5,5.1),
('Bicarbonate','HCO3','Metabolic','mmol/L',22,29),
('Chloride','Cl','Metabolic','mmol/L',98,107),
('Uric Acid','Urate','Metabolic','µmol/L',200,430),
-- Vitamins & Minerals
('Vitamin D','VitD','Vitamins & Minerals','nmol/L',50,150),
('Vitamin B12','B12','Vitamins & Minerals','pmol/L',145,900),
('Folate','Folate','Vitamins & Minerals','nmol/L',7,null),
('Ferritin','Ferr','Vitamins & Minerals','µg/L',30,400),
('Iron','Fe','Vitamins & Minerals','µmol/L',10,30),
('Transferrin Saturation','TSAT','Vitamins & Minerals','%',20,45),
('Calcium','Ca','Vitamins & Minerals','mmol/L',2.2,2.6),
('Magnesium','Mg','Vitamins & Minerals','mmol/L',0.7,1),
('Phosphate','PO4','Vitamins & Minerals','mmol/L',0.8,1.5),
('Zinc','Zn','Vitamins & Minerals','µmol/L',11,24),
-- Hormones
('Testosterone (Total)','Testo','Hormones','nmol/L',8,29),
('SHBG','SHBG','Hormones','nmol/L',18,54),
('Free Androgen Index','FAI','Hormones','%',35,90),
('Cortisol (Morning)','Cort','Hormones','nmol/L',166,507),
('DHEA-S','DHEAS','Hormones','µmol/L',2.2,15.2),
('Insulin','Insulin','Hormones','pmol/L',18,173),
('IGF-1','IGF1','Hormones','nmol/L',11,36),
-- Inflammatory
('CRP (High Sensitivity)','hsCRP','Inflammatory','mg/L',0,1),
('ESR','ESR','Inflammatory','mm/hr',0,15),
('Homocysteine','Hcy','Inflammatory','µmol/L',0,15),
-- Other
('PSA','PSA','Other','µg/L',0,4),
('Rheumatoid Factor','RF','Other','IU/mL',0,14),
-- Sleep
('Sleep Duration','Sleep','Sleep','hrs/night',7,9),
('Sleep Efficiency','Sleep Efficiency','Sleep','%',85,null),
('REM Sleep','REM','Sleep','%',20,25),
('Deep Sleep','Deep Sleep','Sleep','%',15,20),
-- Nutrition
('Omega-3 Index','Omega-3','Nutrition','%',8,null),
('Fibre Intake','Fibre','Nutrition','g/day',30,null),
('Protein Intake','Protein','Nutrition','g/kg/day',1.2,2),
-- Exercise
('Resting Heart Rate','RHR','Exercise','bpm',null,60),
('VO2 Max','VO2max','Exercise','mL/kg/min',35,null),
('Active Minutes','Active Mins','Exercise','min/week',150,null);
```

- [ ] **Run in Supabase SQL editor** — paste the full SQL above into https://supabase.com/dashboard/project/bqljckwsibjlxhikilua/sql/new and click Run.

- [ ] Also create the Supabase Storage bucket manually: go to Storage → New bucket → name: `health-documents`, make it **private**.

- [ ] Commit:

```bash
git add supabase/migrations/004_health.sql
git commit -m "feat: add health records database migration"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `lib/health/types.ts`

- [ ] Create `lib/health/types.ts`:

```typescript
export interface HealthAppointment {
  id: string
  user_id: string
  appointment_date: string
  appointment_type: string
  doctor_name: string | null
  clinic_name: string | null
  status: 'upcoming' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
}

export interface HealthMedicine {
  id: string
  user_id: string
  name: string
  dose: number | null
  dose_unit: string | null
  frequency: string | null
  route: string | null
  start_date: string | null
  end_date: string | null
  prescribing_doctor: string | null
  status: 'active' | 'stopped'
  notes: string | null
  created_at: string
}

export interface BloodMarker {
  id: string
  name: string
  short_name: string | null
  category: string
  unit: string | null
  ref_low: number | null
  ref_high: number | null
  description: string | null
}

export interface BloodResult {
  id: string
  user_id: string
  marker_id: string
  value: number
  test_date: string
  lab_name: string | null
  document_id: string | null
  notes: string | null
  created_at: string
}

export interface BloodMarkerWithResults extends BloodMarker {
  results: BloodResult[]
  latest_value: number | null
  latest_date: string | null
  status: 'normal' | 'high' | 'low' | 'borderline' | 'unknown'
}

export interface HealthDocument {
  id: string
  user_id: string
  name: string
  type: 'blood_result' | 'letter' | 'scan' | 'prescription' | 'other'
  storage_path: string
  file_size_bytes: number | null
  extracted_marker_count: number
  tags: string[]
  created_at: string
}

export interface ExtractedMarker {
  marker_name: string
  value: number
  unit: string
  test_date: string
  lab_name?: string
}
```

- [ ] Commit:

```bash
git add lib/health/types.ts
git commit -m "feat: add health records TypeScript types"
```

---

## Task 3: API Routes — Appointments & Medicines

**Files:**
- Create: `app/api/health/appointments/route.ts`
- Create: `app/api/health/medicines/route.ts`

- [ ] Create `app/api/health/appointments/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('health_appointments')
    .select('*')
    .eq('user_id', user.id)
    .order('appointment_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('health_appointments')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] Create `app/api/health/medicines/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('health_medicines')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('health_medicines')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] Commit:

```bash
git add app/api/health/appointments/route.ts app/api/health/medicines/route.ts
git commit -m "feat: add appointments and medicines API routes"
```

---

## Task 4: API Routes — Blood Markers & Results

**Files:**
- Create: `app/api/health/blood/markers/route.ts`
- Create: `app/api/health/blood/results/route.ts`

- [ ] Create `app/api/health/blood/markers/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: markers, error: mErr } = await supabase
    .from('health_blood_markers')
    .select('*')
    .order('category')

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const { data: results, error: rErr } = await supabase
    .from('health_blood_results')
    .select('*')
    .eq('user_id', user.id)
    .order('test_date', { ascending: false })

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const resultsByMarker = (results || []).reduce<Record<string, typeof results>>((acc, r) => {
    if (!acc[r.marker_id]) acc[r.marker_id] = []
    acc[r.marker_id]!.push(r)
    return acc
  }, {})

  const enriched = (markers || []).map(m => {
    const mrs = resultsByMarker[m.id] || []
    const latest = mrs[0]
    let status: string = 'unknown'
    if (latest) {
      const v = latest.value
      if (m.ref_low !== null && v < m.ref_low) status = 'low'
      else if (m.ref_high !== null && v > m.ref_high) status = 'high'
      else status = 'normal'
    }
    return { ...m, results: mrs.slice(0, 10), latest_value: latest?.value ?? null, latest_date: latest?.test_date ?? null, status }
  })

  return NextResponse.json(enriched)
}
```

- [ ] Create `app/api/health/blood/results/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // body: { marker_id, value, test_date, lab_name?, document_id?, notes? }
  const { data, error } = await supabase
    .from('health_blood_results')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] Commit:

```bash
git add app/api/health/blood/markers/route.ts app/api/health/blood/results/route.ts
git commit -m "feat: add blood markers and results API routes"
```

---

## Task 5: PDF Extraction API

**Files:**
- Create: `lib/health/pdf-extract.ts`
- Create: `app/api/health/blood/extract/route.ts`
- Create: `app/api/health/documents/route.ts`

- [ ] Create `lib/health/pdf-extract.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function extractMarkersFromPdf(pdfBase64: string): Promise<Array<{
  marker_name: string
  value: number
  unit: string
  test_date: string
  lab_name?: string
}>> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: `Extract all blood test markers from this PDF. Return a JSON array with objects: { marker_name, value, unit, test_date (YYYY-MM-DD), lab_name? }. Only extract numeric lab values. Return only the JSON array, no other text.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}
```

- [ ] Create `app/api/health/blood/extract/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractMarkersFromPdf } from '@/lib/health/pdf-extract'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${Date.now()}-${file.name}`
  const { error: uploadErr } = await supabase.storage
    .from('health-documents')
    .upload(storagePath, bytes, { contentType: 'application/pdf' })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // Extract markers
  const markers = await extractMarkersFromPdf(base64)

  return NextResponse.json({ markers, storagePath, fileName: file.name, fileSize: file.size })
}
```

- [ ] Create `app/api/health/documents/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('health_documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('health_documents')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] Commit:

```bash
git add lib/health/pdf-extract.ts app/api/health/blood/extract/route.ts app/api/health/documents/route.ts
git commit -m "feat: add PDF extraction and documents API routes"
```

---

## Task 6: Messages API

**Files:**
- Create: `app/api/health/messages/route.ts`

- [ ] Create `app/api/health/messages/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/email'

const HEALTH_KEYWORDS = [
  'nhs', 'hospital', 'gp ', 'doctor', 'clinic', 'prescription', 'referral',
  'blood', 'results', 'test', 'appointment', 'surgery', 'pharmacy',
  'medichecks', 'bupa', 'vitality', 'axa health',
]

function isHealthRelated(msg: { from?: string; subject?: string }): boolean {
  const haystack = `${msg.from ?? ''} ${msg.subject ?? ''}`.toLowerCase()
  return HEALTH_KEYWORDS.some(kw => haystack.includes(kw))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const all = await listMessages(50)
    const health = all.filter(isHealthRelated)
    return NextResponse.json(health)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] Commit:

```bash
git add app/api/health/messages/route.ts
git commit -m "feat: add health messages API route with keyword filtering"
```

---

## Task 7: Health Layout Shell

**Files:**
- Create: `app/(dashboard)/dashboard/health/layout.tsx`
- Create: `components/health/HealthShell.tsx`

- [ ] Create `components/health/HealthShell.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  { label: 'Home', icon: '🏠', href: '/dashboard/health/home' },
  { label: 'Appointments', icon: '📅', href: '/dashboard/health/appointments' },
  { label: 'Messages', icon: '💬', href: '/dashboard/health/messages' },
  { label: 'Medicines', icon: '💊', href: '/dashboard/health/medicines' },
  { label: 'Test Results', icon: '🩸', href: '/dashboard/health/blood' },
  { label: 'Documents', icon: '📄', href: '/dashboard/health/documents' },
]

interface Props { children: React.ReactNode }

export default function HealthShell({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Good day. I'm JARVIS, your health assistant. Ask me about any of your records." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context: 'health' }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let aiText = ''
      setMessages(m => [...m, { role: 'ai', text: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') break
          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'text') {
              aiText += ev.text
              setMessages(m => [...m.slice(0, -1), { role: 'ai', text: aiText }])
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* JARVIS sidebar */}
      <div style={{
        width: sidebarOpen ? 270 : 44,
        background: '#111',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width .2s',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 12px', borderBottom: '1px solid #1f2937' }}>
          {sidebarOpen && <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>◉ &nbsp;JARVIS</span>}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>
        {sidebarOpen && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  fontSize: 11, lineHeight: 1.5, padding: '7px 9px', borderRadius: 10, maxWidth: '95%',
                  background: m.role === 'ai' ? '#1d4ed8' : '#1f2937',
                  color: m.role === 'ai' ? '#fff' : '#d1d5db',
                  alignSelf: m.role === 'ai' ? 'flex-start' : 'flex-end',
                }}>
                  {m.text || (loading && m.role === 'ai' ? '…' : '')}
                </div>
              ))}
            </div>
            <div style={{ padding: 8, borderTop: '1px solid #1f2937' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask about your health…"
                style={{ width: '100%', background: '#1f2937', border: 'none', borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 11, outline: 'none' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', height: 50, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Health Records</span>
        </div>
        {/* Tab nav */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', flexShrink: 0 }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <button key={tab.href} onClick={() => router.push(tab.href)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 18px', cursor: 'pointer', border: 'none', background: 'none',
                borderBottom: active ? '2px solid #111' : '2px solid transparent',
                color: active ? '#111' : '#6b7280', fontSize: 10, fontWeight: 600,
              }}>
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] Create `app/(dashboard)/dashboard/health/layout.tsx`:

```tsx
import HealthShell from '@/components/health/HealthShell'

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return <HealthShell>{children}</HealthShell>
}
```

- [ ] Commit:

```bash
git add components/health/HealthShell.tsx app/(dashboard)/dashboard/health/layout.tsx
git commit -m "feat: add health module layout with JARVIS sidebar and tab nav"
```

---

## Task 8: Home Tab

**Files:**
- Create: `app/(dashboard)/dashboard/health/page.tsx` (redirect)
- Create: `app/(dashboard)/dashboard/health/home/page.tsx`

- [ ] Create `app/(dashboard)/dashboard/health/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
export default function HealthRoot() {
  redirect('/dashboard/health/home')
}
```

- [ ] Create `app/(dashboard)/dashboard/health/home/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HealthAppointment, HealthMedicine, BloodMarkerWithResults } from '@/lib/health/types'

export default function HealthHomePage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<HealthAppointment[]>([])
  const [medicines, setMedicines] = useState<HealthMedicine[]>([])
  const [markers, setMarkers] = useState<BloodMarkerWithResults[]>([])
  const [messages, setMessages] = useState<{ from?: string; subject?: string; date?: string }[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/health/appointments').then(r => r.json()),
      fetch('/api/health/medicines').then(r => r.json()),
      fetch('/api/health/blood/markers').then(r => r.json()),
      fetch('/api/health/messages').then(r => r.json()),
    ]).then(([appts, meds, mkrs, msgs]) => {
      setAppointments(Array.isArray(appts) ? appts : [])
      setMedicines(Array.isArray(meds) ? meds : [])
      setMarkers(Array.isArray(mkrs) ? mkrs : [])
      setMessages(Array.isArray(msgs) ? msgs : [])
    })
  }, [])

  const upcoming = appointments.filter(a => a.status === 'upcoming').sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
  const nextAppt = upcoming[0]
  const flagged = markers.filter(m => m.status === 'high' || m.status === 'low')
  const activeMeds = medicines.filter(m => m.status === 'active')
  const unread = messages.slice(0, 3)

  const topAlert = flagged[0]

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Good morning, Mohammed</h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Here's your health overview</p>
      </div>

      {topAlert && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>{topAlert.name} is {topAlert.status}</div>
            <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>Latest: {topAlert.latest_value} {topAlert.unit}</div>
          </div>
          <button onClick={() => router.push(`/dashboard/health/blood/${encodeURIComponent(topAlert.name)}`)} style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: 'none', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
            View marker →
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: '📅', val: upcoming.length, label: 'Upcoming appointments', href: '/dashboard/health/appointments' },
          { icon: '💬', val: unread.length, label: 'Health messages', href: '/dashboard/health/messages' },
          { icon: '🩸', val: flagged.length, label: 'Markers flagged', href: '/dashboard/health/blood', hi: flagged.length > 0 },
          { icon: '💊', val: activeMeds.length, label: 'Active medicines', href: '/dashboard/health/medicines' },
        ].map(s => (
          <div key={s.label} onClick={() => router.push(s.href)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.hi ? '#f59e0b' : '#111' }}>{s.val}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Next appointment */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Next appointment</span>
            <button onClick={() => router.push('/dashboard/health/appointments')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: '12px 14px' }}>
            {nextAppt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(nextAppt.appointment_date).getDate()}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{new Date(nextAppt.appointment_date).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{nextAppt.appointment_type}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{nextAppt.doctor_name} · {nextAppt.clinic_name}</div>
                </div>
              </div>
            ) : <p style={{ fontSize: 11, color: '#9ca3af' }}>No upcoming appointments</p>}
          </div>
        </div>

        {/* Flagged markers */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Flagged markers</span>
            <button onClick={() => router.push('/dashboard/health/blood')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Full panel →</button>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flagged.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af' }}>All markers in range</p>}
            {flagged.slice(0, 3).map(m => (
              <div key={m.id} onClick={() => router.push(`/dashboard/health/blood/${encodeURIComponent(m.name)}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 6, borderBottom: '1px solid #f9fafb' }}>
                <div style={{ width: 3, height: 24, borderRadius: 2, background: m.status === 'high' ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: m.status === 'high' ? '#f59e0b' : '#ef4444' }}>{m.latest_value} {m.unit}</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: m.status === 'high' ? '#fef3c7' : '#fee2e2', color: m.status === 'high' ? '#92400e' : '#991b1b' }}>
                  {m.status === 'high' ? 'High' : 'Low'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent health messages */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Recent health messages</span>
            <button onClick={() => router.push('/dashboard/health/messages')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unread.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af' }}>No health messages found</p>}
            {unread.map((msg, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {(msg.from ?? '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{msg.from}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.subject}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Medicines */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Current medicines</span>
            <button onClick={() => router.push('/dashboard/health/medicines')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeMeds.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af' }}>No medicines on record</p>}
            {activeMeds.slice(0, 3).map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>💊</span>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{m.dose}{m.dose_unit} · {m.frequency}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] Commit:

```bash
git add app/(dashboard)/dashboard/health/page.tsx app/(dashboard)/dashboard/health/home/page.tsx
git commit -m "feat: add health home tab with live data"
```

---

## Task 9: Appointments & Medicines Pages

**Files:**
- Create: `app/(dashboard)/dashboard/health/appointments/page.tsx`
- Create: `app/(dashboard)/dashboard/health/medicines/page.tsx`

- [ ] Create `app/(dashboard)/dashboard/health/appointments/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { HealthAppointment } from '@/lib/health/types'

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<HealthAppointment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ appointment_date: '', appointment_type: '', doctor_name: '', clinic_name: '', notes: '' })

  useEffect(() => {
    fetch('/api/health/appointments').then(r => r.json()).then(d => setAppointments(Array.isArray(d) ? d : []))
  }, [])

  async function save() {
    const res = await fetch('/api/health/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const newAppt = await res.json()
    setAppointments(a => [newAppt, ...a])
    setShowForm(false)
    setForm({ appointment_date: '', appointment_type: '', doctor_name: '', clinic_name: '', notes: '' })
  }

  const upcoming = appointments.filter(a => a.status === 'upcoming').sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
  const past = appointments.filter(a => a.status !== 'upcoming').sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))

  const badge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      upcoming: { bg: '#dbeafe', color: '#1e40af' },
      completed: { bg: '#d1fae5', color: '#065f46' },
      cancelled: { bg: '#fee2e2', color: '#991b1b' },
    }
    return map[status] ?? { bg: '#f3f4f6', color: '#6b7280' }
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Appointments</h2>
        <button onClick={() => setShowForm(true)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Appointment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([['appointment_date', 'Date & Time', 'datetime-local'], ['appointment_type', 'Type', 'text'], ['doctor_name', 'Doctor', 'text'], ['clinic_name', 'Clinic / Hospital', 'text']] as const).map(([k, label, type]) => (
              <div key={k}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                <input type={type} value={(form as Record<string, string>)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', resize: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {[{ title: 'Upcoming', items: upcoming }, { title: 'Past', items: past }].map(({ title, items }) => (
        <div key={title} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</p>
          {items.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>None</p>}
          {items.map(a => {
            const d = new Date(a.appointment_date)
            const b = badge(a.status)
            return (
              <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flexShrink: 0, minWidth: 48 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{d.toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.appointment_type}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{a.doctor_name}{a.clinic_name ? ` · ${a.clinic_name}` : ''}</div>
                  {a.notes && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{a.notes}</div>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: b.bg, color: b.color, textTransform: 'capitalize' }}>{a.status}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] Create `app/(dashboard)/dashboard/health/medicines/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { HealthMedicine } from '@/lib/health/types'

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<HealthMedicine[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', dose: '', dose_unit: 'mg', frequency: '', route: 'oral', start_date: '', prescribing_doctor: '', notes: '' })

  useEffect(() => {
    fetch('/api/health/medicines').then(r => r.json()).then(d => setMedicines(Array.isArray(d) ? d : []))
  }, [])

  async function save() {
    const body = { ...form, dose: form.dose ? parseFloat(form.dose) : null }
    const res = await fetch('/api/health/medicines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const m = await res.json()
    setMedicines(ms => [m, ...ms])
    setShowForm(false)
  }

  const active = medicines.filter(m => m.status === 'active')
  const stopped = medicines.filter(m => m.status === 'stopped')

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Medicines</h2>
        <button onClick={() => setShowForm(true)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Medicine</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(['name', 'dose', 'dose_unit', 'frequency', 'route', 'start_date', 'prescribing_doctor'] as const).map(k => (
              <div key={k}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{k.replace('_', ' ')}</label>
                <input value={(form as Record<string, string>)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} type={k === 'start_date' ? 'date' : k === 'dose' ? 'number' : 'text'} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {[{ title: 'Active', items: active }, { title: 'Stopped', items: stopped }].map(({ title, items }) => (
        <div key={title} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</p>
          {items.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>None</p>}
          {items.map(m => (
            <div key={m.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>💊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{m.dose}{m.dose_unit} · {m.frequency} · {m.route}</div>
                {m.prescribing_doctor && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Dr {m.prescribing_doctor}</div>}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: m.status === 'active' ? '#d1fae5' : '#f3f4f6', color: m.status === 'active' ? '#065f46' : '#6b7280' }}>{m.status === 'active' ? 'Active' : 'Stopped'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] Commit:

```bash
git add app/(dashboard)/dashboard/health/appointments/page.tsx app/(dashboard)/dashboard/health/medicines/page.tsx
git commit -m "feat: add appointments and medicines pages"
```

---

## Task 10: Messages Page

**Files:**
- Create: `app/(dashboard)/dashboard/health/messages/page.tsx`

- [ ] Create `app/(dashboard)/dashboard/health/messages/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

interface EmailMsg { uid: number; from?: string; subject?: string; date?: string; text?: string; html?: string }

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<EmailMsg[]>([])
  const [selected, setSelected] = useState<EmailMsg | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health/messages').then(r => r.json()).then(d => { setMsgs(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 280, borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#fff' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13, fontWeight: 700 }}>Health Messages</div>
        {loading && <p style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>Loading…</p>}
        {!loading && msgs.length === 0 && <p style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>No health-related messages found.</p>}
        {msgs.map(m => (
          <div key={m.uid} onClick={() => setSelected(m)} style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: selected?.uid === m.uid ? '#f0f9ff' : '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {(m.from ?? '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.from}</div>
                <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subject}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#fafafa' }}>
        {!selected ? (
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 40, textAlign: 'center' }}>Select a message to read</p>
        ) : (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{selected.subject}</h2>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>From: {selected.from} · {selected.date}</p>
            <div style={{ fontSize: 12, lineHeight: 1.7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              {selected.html
                ? <div dangerouslySetInnerHTML={{ __html: selected.html }} />
                : <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{selected.text}</pre>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] Commit:

```bash
git add app/(dashboard)/dashboard/health/messages/page.tsx
git commit -m "feat: add health messages page pulling from connected email"
```

---

## Task 11: Blood Panel Overview

**Files:**
- Create: `app/(dashboard)/dashboard/health/blood/page.tsx`
- Create: `components/health/BloodAccordion.tsx`

- [ ] Create `components/health/BloodAccordion.tsx`:

```tsx
'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { BloodMarkerWithResults } from '@/lib/health/types'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  high:       { bg: '#fef3c7', color: '#92400e', label: 'High' },
  low:        { bg: '#fee2e2', color: '#991b1b', label: 'Low' },
  borderline: { bg: '#fef3c7', color: '#92400e', label: 'Borderline' },
  normal:     { bg: '#d1fae5', color: '#065f46', label: 'Normal' },
  unknown:    { bg: '#f3f4f6', color: '#6b7280', label: '—' },
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span style={{ width: 40, display: 'inline-block' }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return (
    <svg width="40" height="16" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {values.map((v, i) => {
        const x = (i / (values.length - 1 || 1)) * 36 + 2
        const y = 14 - ((v - min) / range) * 12
        return i === 0 ? null : (
          <line key={i} x1={(((i-1) / (values.length - 1 || 1)) * 36 + 2)} y1={14 - ((values[i-1]! - min) / range) * 12} x2={x} y2={y} stroke="#6b7280" strokeWidth="1.5" />
        )
      })}
    </svg>
  )
}

export default function BloodAccordion({ markers, search }: { markers: BloodMarkerWithResults[]; search: string }) {
  const router = useRouter()
  const [open, setOpen] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? markers.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)) : markers
  }, [markers, search])

  const groups = useMemo(() => {
    return filtered.reduce<Record<string, BloodMarkerWithResults[]>>((acc, m) => {
      if (!acc[m.category]) acc[m.category] = []
      acc[m.category]!.push(m)
      return acc
    }, {})
  }, [filtered])

  // Auto-expand groups with flagged markers or when searching
  const autoOpen = useMemo(() => {
    const s = new Set<string>()
    if (search) Object.keys(groups).forEach(g => s.add(g))
    Object.entries(groups).forEach(([g, ms]) => { if (ms.some(m => m.status === 'high' || m.status === 'low')) s.add(g) })
    return s
  }, [groups, search])

  const isOpen = (g: string) => open.has(g) || autoOpen.has(g)
  const toggle = (g: string) => setOpen(o => { const n = new Set(o); isOpen(g) ? n.delete(g) : n.add(g); return n })

  return (
    <div>
      {Object.entries(groups).map(([cat, ms]) => {
        const flagCount = ms.filter(m => m.status === 'high' || m.status === 'low').length
        const expanded = isOpen(cat)
        return (
          <div key={cat} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
            <div onClick={() => toggle(cat)} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{cat}</span>
              {flagCount > 0 && <span style={{ fontSize: 10, fontWeight: 600, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, marginRight: 10 }}>{flagCount} flagged</span>}
              <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 10 }}>{ms.length} markers</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{expanded ? '▲' : '▼'}</span>
            </div>
            {expanded && ms.map(m => {
              const ss = STATUS_STYLE[m.status] ?? STATUS_STYLE.unknown!
              const vals = m.results.map(r => r.value).reverse()
              return (
                <div key={m.id} onClick={() => router.push(`/dashboard/health/blood/${encodeURIComponent(m.name)}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span style={{ flex: 1, fontSize: 12 }}>{m.name}</span>
                  <Sparkline values={vals} />
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>{m.latest_value != null ? `${m.latest_value} ${m.unit ?? ''}` : '—'}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: ss.bg, color: ss.color, minWidth: 56, textAlign: 'center' }}>{ss.label}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] Create `app/(dashboard)/dashboard/health/blood/page.tsx`:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import type { BloodMarkerWithResults } from '@/lib/health/types'
import BloodAccordion from '@/components/health/BloodAccordion'

export default function BloodPage() {
  const [markers, setMarkers] = useState<BloodMarkerWithResults[]>([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [extractPreview, setExtractPreview] = useState<{ markers: { marker_name: string; value: number; unit: string; test_date: string }[]; storagePath: string; fileName: string; fileSize: number } | null>(null)

  useEffect(() => {
    fetch('/api/health/blood/markers').then(r => r.json()).then(d => setMarkers(Array.isArray(d) ? d : []))
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || file.type !== 'application/pdf') return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/health/blood/extract', { method: 'POST', body: fd })
    const data = await res.json()
    setExtractPreview(data)
    setUploading(false)
  }, [])

  async function confirmExtract() {
    if (!extractPreview) return
    // Save document record
    await fetch('/api/health/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: extractPreview.fileName, type: 'blood_result', storage_path: extractPreview.storagePath, file_size_bytes: extractPreview.fileSize, extracted_marker_count: extractPreview.markers.length }) })
    // Save each result
    for (const em of extractPreview.markers) {
      const match = markers.find(m => m.name.toLowerCase() === em.marker_name.toLowerCase() || m.short_name?.toLowerCase() === em.marker_name.toLowerCase())
      if (match) {
        await fetch('/api/health/blood/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marker_id: match.id, value: em.value, test_date: em.test_date }) })
      }
    }
    setExtractPreview(null)
    // Refresh
    fetch('/api/health/blood/markers').then(r => r.json()).then(d => setMarkers(Array.isArray(d) ? d : []))
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search markers…" style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 12, outline: 'none' }} />
      </div>

      {/* Drop zone */}
      <div onDragOver={e => e.preventDefault()} onDrop={onDrop} style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16, background: '#fff', cursor: 'pointer' }}>
        {uploading ? <p style={{ fontSize: 12, color: '#6b7280' }}>Extracting markers…</p> : (
          <>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Drop a blood results PDF here</p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>JARVIS will extract markers automatically</p>
          </>
        )}
      </div>

      {/* Extract review modal */}
      {extractPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Extracted markers</h3>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>{extractPreview.markers.length} markers found in {extractPreview.fileName}. Review before saving.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>{['Marker', 'Value', 'Unit', 'Date'].map(h => <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>)}</tr></thead>
              <tbody>{extractPreview.markers.map((m, i) => <tr key={i}>{[m.marker_name, m.value, m.unit, m.test_date].map((v, j) => <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{String(v)}</td>)}</tr>)}</tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={confirmExtract} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save all</button>
              <button onClick={() => setExtractPreview(null)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <BloodAccordion markers={markers} search={search} />
    </div>
  )
}
```

- [ ] Commit:

```bash
git add components/health/BloodAccordion.tsx app/(dashboard)/dashboard/health/blood/page.tsx
git commit -m "feat: add blood panel overview with accordion, search, and PDF upload"
```

---

## Task 12: Per-Marker Detail Page

**Files:**
- Create: `app/(dashboard)/dashboard/health/blood/[marker]/page.tsx`
- Create: `components/health/BloodTrendChart.tsx`
- Create: `components/health/ImprovementCard.tsx`

- [ ] Create `components/health/BloodTrendChart.tsx`:

```tsx
'use client'
import type { BloodMarkerWithResults } from '@/lib/health/types'

const W = 560, H = 200, PAD = { top: 16, right: 16, bottom: 36, left: 48 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

export default function BloodTrendChart({ marker }: { marker: BloodMarkerWithResults }) {
  const sorted = [...marker.results].sort((a, b) => a.test_date.localeCompare(b.test_date))
  if (!sorted.length) return <p style={{ fontSize: 12, color: '#9ca3af' }}>No results yet</p>

  const vals = sorted.map(r => r.value)
  const refLow = marker.ref_low
  const refHigh = marker.ref_high
  const allVals = [...vals, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])]
  const minV = Math.min(...allVals) * 0.9
  const maxV = Math.max(...allVals) * 1.1
  const range = maxV - minV || 1

  const toX = (i: number) => PAD.left + (i / (sorted.length - 1 || 1)) * INNER_W
  const toY = (v: number) => PAD.top + INNER_H - ((v - minV) / range) * INNER_H

  const pointColor = (v: number) => {
    if (refHigh != null && v > refHigh) return '#ef4444'
    if (refLow != null && v < refLow) return '#ef4444'
    return '#10b981'
  }

  const linePath = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(r.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
      {/* Normal range band */}
      {refLow != null && refHigh != null && (
        <rect x={PAD.left} y={toY(refHigh)} width={INNER_W} height={toY(refLow) - toY(refHigh)} fill="#d1fae5" opacity={0.6} />
      )}
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD.top + f * INNER_H
        const v = maxV - f * range
        return (
          <g key={f}>
            <line x1={PAD.left} y1={y} x2={PAD.left + INNER_W} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{v.toFixed(1)}</text>
          </g>
        )
      })}
      {/* Line */}
      <path d={linePath} fill="none" stroke="#6b7280" strokeWidth={2} />
      {/* Data points */}
      {sorted.map((r, i) => (
        <g key={r.id}>
          <circle cx={toX(i)} cy={toY(r.value)} r={5} fill={pointColor(r.value)} stroke="#fff" strokeWidth={1.5} />
          <text x={toX(i)} y={H - 6} textAnchor="middle" fontSize={8} fill="#9ca3af">{r.test_date.slice(0, 7)}</text>
        </g>
      ))}
      {/* Ref lines */}
      {refHigh != null && <line x1={PAD.left} y1={toY(refHigh)} x2={PAD.left + INNER_W} y2={toY(refHigh)} stroke="#10b981" strokeWidth={1} strokeDasharray="4" />}
      {refLow != null && <line x1={PAD.left} y1={toY(refLow)} x2={PAD.left + INNER_W} y2={toY(refLow)} stroke="#10b981" strokeWidth={1} strokeDasharray="4" />}
    </svg>
  )
}
```

- [ ] Create `components/health/ImprovementCard.tsx`:

```tsx
'use client'
import type { BloodMarkerWithResults } from '@/lib/health/types'

const ADVICE: Record<string, { diet: string; exercise: string; medications: string; lifestyle: string; gp: string }> = {
  'ALT': {
    diet: 'Reduce alcohol and ultra-processed foods. Increase leafy greens, olive oil, and coffee (shown to protect liver).',
    exercise: 'Aim for 150 min/week moderate aerobic exercise. Exercise reduces liver fat directly.',
    medications: 'Review all supplements and OTC medications with your GP — some are hepatotoxic.',
    lifestyle: 'Avoid alcohol entirely while elevated. Maintain healthy weight; even 5% weight loss reduces ALT.',
    gp: 'Ask about hepatic ultrasound, full liver screen, and whether a gastroenterology referral is warranted.',
  },
  'Vitamin D': {
    diet: 'Eat oily fish (salmon, mackerel), egg yolks, and fortified foods. Sun exposure on skin 10–30 min midday.',
    exercise: 'Outdoor exercise doubles benefit — exercise + sunlight simultaneously.',
    medications: 'Discuss supplementation — typically 1000–4000 IU D3 daily with K2 for co-absorption.',
    lifestyle: 'Spend time outdoors daily. Darker skin tones may need higher supplementation.',
    gp: 'Ask for a repeat test in 3 months after supplementing, and for optimal target level (>75 nmol/L).',
  },
  'Total Cholesterol': {
    diet: 'Reduce saturated fat (red meat, full-fat dairy). Increase soluble fibre (oats, legumes), nuts, and omega-3s.',
    exercise: 'Aerobic exercise raises HDL and lowers LDL. Target 30 min most days.',
    medications: 'Discuss statin therapy if cardiovascular risk is elevated alongside cholesterol.',
    lifestyle: 'Quit smoking if applicable. Manage stress — cortisol raises LDL.',
    gp: 'Ask for a cardiovascular risk score (QRISK3), not just the cholesterol number in isolation.',
  },
}

const DEFAULT = {
  diet: 'Maintain a balanced diet rich in vegetables, whole grains, and lean protein.',
  exercise: 'Regular moderate exercise (150 min/week) supports most metabolic markers.',
  medications: 'Discuss with your GP whether any supplements or medications could help.',
  lifestyle: 'Prioritise sleep, reduce stress, and avoid smoking.',
  gp: 'Ask your GP what target value you should aim for and in what timeframe.',
}

export default function ImprovementCard({ marker }: { marker: BloodMarkerWithResults }) {
  const advice = ADVICE[marker.name] ?? DEFAULT
  const sections = [
    { icon: '🥗', label: 'Diet', text: advice.diet },
    { icon: '🏃', label: 'Exercise', text: advice.exercise },
    { icon: '💊', label: 'Medications', text: advice.medications },
    { icon: '🌙', label: 'Lifestyle', text: advice.lifestyle },
  ]
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, fontWeight: 700 }}>How to improve {marker.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {sections.map((s, i) => (
          <div key={s.label} style={{ padding: '12px 16px', borderBottom: i < 2 ? '1px solid #f3f4f6' : undefined, borderRight: i % 2 === 0 ? '1px solid #f3f4f6' : undefined }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon} <strong style={{ fontSize: 11 }}>{s.label}</strong></div>
            <p style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6 }}>{s.text}</p>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', background: '#f0f9ff', borderTop: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>Questions to ask your GP</p>
        <p style={{ fontSize: 11, color: '#1e40af' }}>{advice.gp}</p>
      </div>
    </div>
  )
}
```

- [ ] Create `app/(dashboard)/dashboard/health/blood/[marker]/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { BloodMarkerWithResults } from '@/lib/health/types'
import BloodTrendChart from '@/components/health/BloodTrendChart'
import ImprovementCard from '@/components/health/ImprovementCard'

const STATUS_COLOR: Record<string, string> = { high: '#f59e0b', low: '#ef4444', normal: '#10b981', borderline: '#f59e0b', unknown: '#9ca3af' }

export default function MarkerDetailPage() {
  const { marker: markerParam } = useParams<{ marker: string }>()
  const router = useRouter()
  const [marker, setMarker] = useState<BloodMarkerWithResults | null>(null)

  useEffect(() => {
    fetch('/api/health/blood/markers').then(r => r.json()).then((all: BloodMarkerWithResults[]) => {
      const found = all.find(m => m.name === decodeURIComponent(markerParam))
      setMarker(found ?? null)
    })
  }, [markerParam])

  if (!marker) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  const sorted = [...marker.results].sort((a, b) => b.test_date.localeCompare(a.test_date))
  const col = STATUS_COLOR[marker.status] ?? '#9ca3af'

  return (
    <div style={{ padding: '20px 22px', maxWidth: 720 }}>
      <button onClick={() => router.push('/dashboard/health/blood')} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>← Back to panel</button>

      {/* Hero */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>{marker.name}</h1>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{marker.category}</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: col }}>{marker.latest_value ?? '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{marker.unit}</div>
        </div>
        <div style={{ background: col + '20', color: col, padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
          {marker.status.charAt(0).toUpperCase() + marker.status.slice(1)}
        </div>
        {marker.ref_low != null && marker.ref_high != null && (
          <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
            <div style={{ fontWeight: 600 }}>Reference</div>
            <div>{marker.ref_low}–{marker.ref_high} {marker.unit}</div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Trend over time</div>
        <BloodTrendChart marker={marker} />
      </div>

      {/* Results table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 12, fontWeight: 700 }}>Results history</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>{['Date', 'Value', 'Unit', 'Reference', 'Status', 'Lab'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 14px', background: '#fafafa', color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #f3f4f6' }}>{h}</th>)}</tr></thead>
          <tbody>
            {sorted.map(r => {
              let st = 'normal'
              if (marker.ref_high != null && r.value > marker.ref_high) st = 'high'
              else if (marker.ref_low != null && r.value < marker.ref_low) st = 'low'
              const c = STATUS_COLOR[st] ?? '#9ca3af'
              return (
                <tr key={r.id}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb' }}>{r.test_date}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', fontWeight: 700, color: c }}>{r.value}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', color: '#6b7280' }}>{marker.unit}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', color: '#6b7280' }}>{marker.ref_low ?? '?'}–{marker.ref_high ?? '?'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb' }}><span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: c + '20', color: c }}>{st}</span></td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', color: '#9ca3af' }}>{r.lab_name ?? '—'}</td>
                </tr>
              )
            })}
            {!sorted.length && <tr><td colSpan={6} style={{ padding: '16px 14px', color: '#9ca3af', textAlign: 'center' }}>No results recorded yet</td></tr>}
          </tbody>
        </table>
      </div>

      <ImprovementCard marker={marker} />
    </div>
  )
}
```

- [ ] Commit:

```bash
git add components/health/BloodTrendChart.tsx components/health/ImprovementCard.tsx app/(dashboard)/dashboard/health/blood/[marker]/page.tsx
git commit -m "feat: add per-marker detail page with trend chart and improvement card"
```

---

## Task 13: Documents Page

**Files:**
- Create: `app/(dashboard)/dashboard/health/documents/page.tsx`

- [ ] Create `app/(dashboard)/dashboard/health/documents/page.tsx`:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import type { HealthDocument } from '@/lib/health/types'

const TYPE_STYLE: Record<string, { icon: string; bg: string; badge: string; badgeColor: string; label: string }> = {
  blood_result:  { icon: '🩸', bg: '#fee2e2', badge: '#fee2e2', badgeColor: '#991b1b', label: 'Blood Results' },
  letter:        { icon: '✉',  bg: '#dbeafe', badge: '#dbeafe', badgeColor: '#1e40af', label: "Doctor's Letter" },
  scan:          { icon: '🔬', bg: '#fef3c7', badge: '#fef3c7', badgeColor: '#92400e', label: 'Scan / Imaging' },
  prescription:  { icon: '💊', bg: '#d1fae5', badge: '#d1fae5', badgeColor: '#065f46', label: 'Prescription' },
  other:         { icon: '📄', bg: '#f3f4f6', badge: '#f3f4f6', badgeColor: '#6b7280', label: 'Other' },
}

const FILTERS = ['All', 'Blood Results', "Doctor's Letters", 'Scans', 'Prescriptions']
const FILTER_MAP: Record<string, string[]> = { 'Blood Results': ['blood_result'], "Doctor's Letters": ['letter'], 'Scans': ['scan'], 'Prescriptions': ['prescription'] }

export default function DocumentsPage() {
  const [docs, setDocs] = useState<HealthDocument[]>([])
  const [filter, setFilter] = useState('All')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetch('/api/health/documents').then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []))
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || file.type !== 'application/pdf') return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/health/blood/extract', { method: 'POST', body: fd })
    const data = await res.json()
    // Save document record
    const docRes = await fetch('/api/health/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.fileName, type: 'other', storage_path: data.storagePath, file_size_bytes: data.fileSize, extracted_marker_count: data.markers?.length ?? 0 }) })
    const newDoc = await docRes.json()
    setDocs(d => [newDoc, ...d])
    setUploading(false)
  }, [])

  const filtered = filter === 'All' ? docs : docs.filter(d => (FILTER_MAP[filter] ?? []).includes(d.type))

  const formatSize = (b: number | null) => {
    if (!b) return ''
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
    return `${(b / 1e3).toFixed(0)} KB`
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid #e5e7eb', background: filter === f ? '#111' : '#fff', color: filter === f ? '#fff' : '#6b7280' }}>{f}</button>
        ))}
      </div>

      <div onDragOver={e => e.preventDefault()} onDrop={onDrop} style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16, background: '#fff' }}>
        {uploading ? <p style={{ fontSize: 12, color: '#6b7280' }}>Uploading…</p> : (
          <>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Drop PDFs here to upload</p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Blood results, letters, scans, prescriptions</p>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {filtered.map(doc => {
          const ts = TYPE_STYLE[doc.type] ?? TYPE_STYLE.other!
          return (
            <div key={doc.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: ts.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{ts.icon}</div>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 7px', borderRadius: 8, background: ts.badge, color: ts.badgeColor }}>{ts.label}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{doc.name}</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(doc.created_at).toLocaleDateString()} · {formatSize(doc.file_size_bytes)} · PDF</div>
              {doc.extracted_marker_count > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, background: '#f3f4f6', color: '#6b7280', padding: '2px 7px', borderRadius: 6 }}>✓ {doc.extracted_marker_count} markers</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] Commit:

```bash
git add app/(dashboard)/dashboard/health/documents/page.tsx
git commit -m "feat: add documents tab with PDF upload and grid view"
```

---

## Task 14: Add Health link to Dashboard nav

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx` (or the nav component)

- [ ] Find the nav/sidebar that lists dashboard links:

```bash
grep -r "kanban\|email\|calendar" app --include="*.tsx" -l
```

- [ ] Add a Health link to the navigation. Open whichever file contains the nav links and add:

```tsx
{ href: '/dashboard/health', label: 'Health', icon: '🏥' }
```

alongside the existing items (kanban, email, calendar, blog).

- [ ] Commit:

```bash
git commit -am "feat: add Health to dashboard navigation"
```

---

## Task 15: Verify & Push

- [ ] Run type check:

```bash
npx tsc --noEmit
```

Fix any errors before proceeding.

- [ ] Start dev server and open the health module in browser:

```bash
npm run dev
```

Navigate to `http://localhost:3000/dashboard/health`. Verify:
- JARVIS sidebar opens and collapses
- All 6 tabs navigate correctly
- Home tab renders (stats tiles show 0 until data is added)
- Appointments tab shows Add form and saves
- Medicines tab shows Add form and saves
- Blood panel accordion renders all marker categories
- Per-marker detail page loads when a marker row is clicked
- Documents tab renders drop zone and grid

- [ ] Switch GitHub auth and push:

```bash
gh auth switch --user mmsrashid
git push
gh auth switch --user mmsrashid-profinity
```
