# mmsrashid.com — Personal Website Design Spec

**Date:** 2026-06-19  
**Domain:** mmsrashid.com  
**Owner:** Mohammed Rashid

---

## Overview

A personal website with two distinct zones:

1. **Public site** — portfolio, CV, blog, and visitor contact for a mixed audience (recruiters, clients, collaborators)
2. **Private dashboard** — personal productivity tools accessible only to Mohammed, protected by Supabase Auth

Built as a single Next.js 14 application deployed to Vercel, with Supabase as the database and auth provider.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth + Database | Supabase (Postgres + Auth + Storage) |
| Vector Store | Supabase pgvector (Phase 2) |
| Rich Text Editor | Tiptap |
| Hosting | Vercel |
| Email APIs | Gmail API (OAuth), Microsoft Graph API (OAuth) |
| AI Models | Claude (Anthropic), GPT-4o (OpenAI) — switchable per task |

---

## Architecture

```
app/
  (public)/           # No auth required — statically rendered
    page.tsx          # Home
    portfolio/
    cv/
    blog/
      page.tsx        # Post list
      [slug]/         # Individual post
    login/
  (dashboard)/        # Protected by middleware — Supabase session required
    dashboard/
      email/
      kanban/
      blog/           # Blog editor
      properties/
      tax/
      budget/
      assistant/
  api/
    chat-widget/      # Visitor contact capture
    email/            # Email sync + actions
    kanban/           # Kanban CRUD
    blog/             # Blog CRUD
    properties/       # Property data
    assistant/        # AI assistant
middleware.ts         # Redirects unauthenticated users away from /dashboard
```

**Auth:** Supabase email/password auth. Single user (Mohammed). No registration flow — account created directly in Supabase dashboard. Middleware checks for a valid Supabase session on all `/dashboard/*` routes.

**Database:** Supabase Postgres with Row Level Security (RLS) policies ensuring all data is private by default.

---

## Phase 1: Public Site

### Home (`/`)
- Hero section: name, title ("Mechanical & Software Engineer"), short bio
- Navigation to Portfolio, CV, Blog
- LinkedIn and GitHub links
- Persistent floating chat widget (all pages)

### Portfolio (`/portfolio`)
- Grid of project cards
- Each card: title, description, tech stack tags, optional GitHub/live link
- Data stored in Supabase `projects` table, managed from dashboard

### CV (`/cv`)
- Experience timeline (professional software engineering roles)
- Education section (mechanical engineering degree)
- Skills section
- PDF download button (static PDF stored in Supabase Storage)

### Blog (`/blog` + `/blog/[slug]`)
- Post list with title, date, cover image, excerpt
- Individual post page rendered from Tiptap rich text content
- Only published posts visible publicly

### Login (`/login`)
- Supabase Auth email/password form
- On success: redirect to `/dashboard`

### Visitor Chat Widget
- Floating button, present on all public pages
- Opens a chat panel
- Visitor submits name, email, message
- Saved to Supabase `visitor_messages` table
- Mohammed notified via email
- Messages also appear in the dashboard Email Hub as a special inbox

---

## Phase 1: Private Dashboard

### Layout
- Persistent sidebar navigation
- Links to: Email Hub, Kanban, Blog Editor, Calendar, (future: Properties, Tax, Budget, Assistant)
- User avatar and logout button

### Email Hub (`/dashboard/email`)
- Connect multiple Gmail and Outlook accounts via OAuth
- Unified inbox view with per-account filter tabs
- Actions: read, reply, archive, delete
- Visitor chat messages appear as a separate "Website" inbox tab
- Email metadata (sender, subject, date, read status) cached in Supabase; full body fetched on demand from provider API
- Phase 1 scope: reply only, no compose-from-scratch

### Kanban Board (`/dashboard/kanban`)
- Columns: Idea → To Do → In Progress → Done
- Cards: title, description, tags, optional due date
- Drag and drop between columns (using `@dnd-kit`)
- Quick-add card button
- Data stored in Supabase `kanban_cards` table

### Blog Editor (`/dashboard/blog`)
- List of all posts (draft and published)
- Create/edit post: title, slug (auto-generated, editable), cover image upload, Tiptap rich text body
- Toggle publish/draft status
- Delete post

### Calendar (`/dashboard/calendar`)
- Unified calendar view combining personal and work calendars
- Connect multiple Google Calendar and Outlook/Microsoft 365 calendar accounts via OAuth
- Month, week, and day views
- Create, edit, and delete events from the dashboard
- Colour-coded calendars per account/calendar source
- Events synced bidirectionally — changes made in the dashboard reflect in the source calendar
- Quick-add event from anywhere in the dashboard

---

## Phase 2: AI Personal Assistant (`/dashboard/assistant`)

### Overview
A conversational AI assistant with full awareness of Mohammed's data (emails, kanban, properties, budget) and the ability to act on it.

### Model Strategy
- Default model: Claude (Anthropic) for reasoning-heavy tasks
- GPT-4o (OpenAI) available as an alternative
- Model selector in the assistant UI — switchable per session or per message

### Memory Architecture
Three layers:

1. **Curated facts file** — always loaded into every conversation. A structured document Mohammed maintains: preferences, key contacts, property details, accountant info, etc. Editable from the assistant settings page.
2. **Session memory** — context of the current conversation, managed in the message thread
3. **Full memory database** — Supabase pgvector table. Past conversations, notes, and important facts are embedded and stored. The assistant retrieves semantically relevant memories on each message using vector similarity search.

### Capabilities
- Conversational Q&A (private ChatGPT equivalent)
- Read access: emails, kanban cards, properties, budget data
- Write actions: create kanban cards, draft email replies, log property expenses
- Memory retrieval: surfaces relevant past context automatically
- Draft assistance: emails, messages, documents

### Data Flow
1. User sends message
2. System retrieves top-k relevant memories from pgvector
3. System appends curated facts + relevant live data (emails, kanban summary) to context
4. Message sent to selected AI model
5. Response streamed back
6. Conversation turn saved to memory database and embedded for future retrieval

---

## Phase 3: Property Management (`/dashboard/properties`)

### Overview
Portfolio view of 4 properties, all income flowing through one bank account, managed via agents via email/Google Drive.

### Portfolio View
- Monthly dashboard: all 4 properties side by side
- Per-property: rental income, agent fees, maintenance costs, net income
- Portfolio totals: gross income, total expenses, net yield
- Date range filter (month/quarter/year/custom)
- Sortable columns

### Property Detail View
- Full income and expense ledger for a single property
- Expense categories: agent fees, maintenance, insurance, mortgage, other
- Document attachments (lease, inspection reports — stored in Supabase Storage)
- Link to related emails (filtered from Email Hub by property tag)

### Data Entry
- Manual entry of income/expense transactions
- AI assistant can parse email attachments from agents and suggest entries (Phase 2 integration)

---

## Phase 3: UK Tax Returns (`/dashboard/tax`)

### Overview
Track rental and other income throughout the tax year, generate a self-assessment summary for filing.

### Features
- Tax year view (April–April)
- Automatically aggregates property income/expenses from the property module
- Manual entry for other income sources (employment, dividends, etc.)
- Allowable expense tracking (letting agent fees, repairs, insurance, mortgage interest)
- Self-assessment summary report: pre-fills SA105 (UK property income supplement) figures
- Export to PDF for filing or handing to an accountant
- Tax year comparison view

---

## Phase 3: Net Worth Tracker (`/dashboard/networth`)

### Overview
A consolidated view of Mohammed's total assets and liabilities, calculating gross and net asset value (net worth) across all asset classes.

### Asset Classes

**Public Equities**
- Stocks, ETFs, and funds held in ISA or GIA accounts
- Each holding: asset name, ticker, quantity, purchase price, current price, account type (ISA/GIA)
- Prices auto-fetched daily via market data API (Yahoo Finance / Polygon.io) for exchange-listed assets
- Manual price override for anything not found on a public exchange
- Unrealised gain/loss calculated per holding

**Private Equities & Angel Investments**
- Unlisted company stakes and angel investments
- Each entry: company name, investment date, amount invested, current estimated valuation, ownership percentage, stage (seed/series A/etc.)
- Manual valuation updates (no market feed available)

**Property**
- Pulls valuations from the Property Management module
- Each property: current estimated market value (manual entry), outstanding mortgage/debt balance
- Net property value = market value − debt owed

**Other Assets** (future-proofed)
- Cash savings accounts, pensions — manual entry

### Net Worth Calculation

```
Gross Asset Value = Σ(public equity market values) + Σ(private equity valuations) + Σ(property market values) + cash
Net Asset Value   = Gross Asset Value − Σ(all debts: mortgages, loans)
```

### Dashboard Views
- **Net Worth Summary** — single headline figure (net worth), with breakdown bar showing asset class proportions
- **Asset breakdown** — pie/bar chart by class (public equities, private equities, property, cash)
- **Account breakdown** — ISA vs GIA vs direct holdings
- **Liability breakdown** — per-property mortgage balances + any other debts
- **Historical trend** — net worth over time (snapshotted monthly)
- Date filter to view net worth at a past point in time

### Data Flow
- Public equity prices: fetched automatically on page load / daily cron job, cached in Supabase
- Property values: pulled from `properties` table (user updates estimated value manually)
- Mortgage balances: pulled from `property_transactions` or a dedicated `liabilities` table
- Private equity valuations: manual entry only

---

## Phase 3: Budget Planner (`/dashboard/budget`)

### Overview
Full personal financial overview: all bank accounts tracked, spending tagged, and a rolling 12-month forward budget.

### Features
- **Bank account tracking** — connect multiple bank accounts (manual import via CSV or Open Banking API)
- **Transaction tagging** — categorise spending (rent, food, transport, utilities, subscriptions, property, etc.)
- **Spending dashboard** — monthly breakdown by category, trend charts
- **Forward budget** — plan expected income and expenses for the next 12 months
  - Income sources: salary, rental income, dividends
  - Expense categories: fixed (mortgage, subscriptions) and variable (food, travel)
- **Actuals vs budget** — compare planned vs real spend each month
- Integrates with property module for rental income data

---

## Database Schema (Supabase)

### Phase 1 Tables
- `projects` — portfolio items
- `posts` — blog posts (title, slug, content_json, cover_image_url, published, published_at)
- `visitor_messages` — public chat widget submissions
- `email_accounts` — connected email OAuth accounts
- `email_cache` — cached email metadata
- `kanban_cards` — (id, title, description, column, position, tags, due_date)

### Phase 2 Tables
- `assistant_messages` — conversation history
- `memory_embeddings` — pgvector table for semantic memory retrieval
- `assistant_facts` — curated facts document (single row, text)

### Phase 3 Tables
- `properties` — (id, name, address, agent_name, agent_email, estimated_value)
- `property_transactions` — (id, property_id, date, type, category, amount, description, attachment_url)
- `bank_accounts` — connected accounts
- `transactions` — (id, account_id, date, amount, description, category, tag)
- `budget_entries` — (id, month, category, planned_amount, type: income/expense)
- `investment_accounts` — (id, name, type: ISA/GIA/direct)
- `holdings` — (id, account_id, ticker, name, quantity, purchase_price, current_price, last_updated)
- `private_investments` — (id, company_name, date, amount_invested, current_valuation, ownership_pct, stage)
- `liabilities` — (id, name, type: mortgage/loan, linked_property_id, balance, interest_rate)
- `networth_snapshots` — (id, date, gross_value, net_value, breakdown_json)

---

## Phased Delivery

| Phase | Scope | Prerequisites |
|---|---|---|
| 1 | Public site + Email Hub + Kanban + Blog Editor | None |
| 2 | AI Personal Assistant | Phase 1 complete |
| 3 | Properties + Tax + Budget + Net Worth Tracker | Phase 1 complete, Phase 2 optional |

Phase 2 and Phase 3 can be built in parallel once Phase 1 is complete.

---

## Out of Scope (this spec)
- Multi-user support
- Mobile app
- Tenant-facing portal
- Automated bank feeds (Open Banking) — Phase 3 starts with CSV import
- Automated tax filing (generates summary only, filing is manual)
