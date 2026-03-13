# SpecFlow

[![npm version](https://badge.fury.io/js/specflow.svg)](https://badge.fury.io/js/specflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Generate production-ready TypeScript backends from markdown specifications using AI.

**Write rough ideas → AI creates professional specs → You review → Generate production code**

---

## 🚀 Quick Start (2 minutes)

```bash
# Create a new project
npx specflow init my-api --example
cd my-api
```

That's it. You now have a project with example specs to try.

---

## 📝 Step 1: Write Your Rough Ideas

After `specflow init`, you'll see this folder:

```
my-api/
├── requirements/          ← YOU WRITE HERE
│   ├── *.md               ← Drop your rough notes here (any .md file)
│   ├── business/          ← (created by specflow prepare)
│   ├── technical/         ← (created by specflow prepare)
│   └── schemas/           ← (optional: shared JSON schemas)
└── specflow.config.yaml
```

**Where to write:** Drop `.md` files directly in the `requirements/` folder. Write whatever you want — bullet points, rough notes, plain English. No special format needed.

### Example: `requirements/my-api-ideas.md`

```markdown
# My API

## User Registration
- Users sign up with email and password
- Validate email format
- Hash passwords
- Send verification email
- No duplicate emails

## User Login
- Login with email/password
- Return JWT token
- Lock account after 5 failed attempts

## Orders
- Authenticated users can create orders
- Each order has products with quantities
- Calculate total server-side (don't trust client)
- Check stock before creating order
- Send confirmation email
```

That's all you need. One file, many files, bullet points, paragraphs — whatever works for you.

---

## 🤖 Step 2: `specflow prepare` — AI Creates Professional Specs

```bash
npx specflow prepare
```

This is the magic step. The AI:
1. **Reads** your rough notes from `requirements/*.md`
2. **Analyzes** what you're describing (endpoints, business rules, data models)
3. **Asks you questions** if anything is ambiguous (interactive terminal prompts)
4. **Creates professional specs** in two categories:

```
requirements/
├── my-api-ideas.md                              ← Your original rough notes
├── business/                                     ← AI CREATES THESE
│   ├── auth/
│   │   ├── user-registration.req.md             ← Detailed business rules
│   │   └── user-login.req.md
│   └── orders/
│       └── create-order.req.md
├── technical/                                    ← AI CREATES THESE
│   ├── auth/
│   │   ├── POST-auth-register.contract.md       ← Full API contract
│   │   └── POST-auth-login.contract.md
│   └── orders/
│       └── POST-orders.contract.md
└── schemas/
    ├── user.schema.json                          ← AI CREATES THESE
    └── order.schema.json
```

**What's inside the generated specs:**

A `.req.md` file (business requirements):
```markdown
---
id: REQ-AUTH-001
title: User Registration
domain: auth
type: business-requirement
status: active
endpoint: POST /api/v1/auth/register
---

# User Registration

## Business Rules

### BR-1: Email Validation
- Email must be valid RFC 5322 format
- Email must not already exist in the database (case-insensitive)
- Disposable email domains are rejected

### BR-2: Password Requirements
- Minimum 8 characters
- At least 1 uppercase, 1 lowercase, 1 digit, 1 special character

### BR-3: Account Creation
- Hash password with bcrypt cost factor 12
- Generate UUID v4 as user ID
- Set status to pending_verification

## Edge Cases
- Database unavailable: return 503
- Email service failure: user still created, background retry
```

A `.contract.md` file (API contract):
```markdown
---
id: CONTRACT-AUTH-001
method: POST
path: "/api/v1/auth/register"
requires_auth: false
rate_limit: "5/hour/ip"
---

# POST /api/v1/auth/register

## Request Schema
​```json
{
  "type": "object",
  "required": ["email", "password", "firstName", "lastName"],
  "properties": {
    "email": { "type": "string", "format": "email" },
    "password": { "type": "string", "minLength": 8 }
  }
}
​```

## Response Schema (201 Created)
​```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string" },
    "status": { "type": "string", "enum": ["pending_verification"] }
  }
}
​```

## Error Responses
| Status | Code | When |
|--------|------|------|
| 400 | VALIDATION_ERROR | Bad request body |
| 409 | REGISTRATION_FAILED | Email exists |
| 429 | RATE_LIMIT_EXCEEDED | Too many attempts |
```

---

## 👀 Step 3: Review the Professional Specs

**This is your review gate.** Before any code is generated, you check the specs:

```bash
# See what endpoints were created
npx specflow list

# Read and edit any spec file
# Open requirements/business/ and requirements/technical/ in your editor
# Change anything you want — add rules, remove endpoints, fix schemas
```

The specs are just markdown files. Edit them freely. They're YOUR documentation now.

---

## ⚡ Step 4: `specflow generate` — Create Production Code

```bash
npx specflow generate
```

This reads the professional specs (NOT your rough notes) and generates a complete backend:

```
generated/                        ← PRODUCTION CODE
├── src/
│   ├── server.ts                 ← Bun + Hono entry point
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── register.ts       ← Real route handler with business logic
│   │   │   └── login.ts
│   │   └── orders/
│   │       └── create.ts
│   ├── schemas/
│   │   └── auth.schemas.ts       ← Zod validation (from JSON schemas)
│   ├── db/
│   │   └── schema.ts             ← Drizzle ORM tables
│   ├── middleware/
│   │   ├── auth.ts               ← JWT authentication
│   │   └── rate-limit.ts         ← Rate limiting
│   └── lib/
│       └── errors.ts             ← Error handling
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml            ← PostgreSQL + Redis
```

**What's deterministic (no LLM, always the same):**
- Zod schemas (compiled directly from JSON schemas)
- Drizzle table definitions (inferred from schemas)
- Server boilerplate, middleware, Docker config

**What's LLM-generated (the smart part):**
- Route handler business logic (implements your business rules as real code)

---

## 🏃 Step 5: Run It

```bash
# Start development server
npx specflow dev

# Or manually
cd generated
bun install
bun run dev
```

Your API is now live at `http://localhost:3000`.

---

## 🛠️ All Commands

| Command | What it does |
|---------|-------------|
| `specflow init [name]` | Create project with folder structure |
| `specflow init [name] --example` | Create project with example specs |
| `specflow prepare` | Rough notes → professional specs (interactive) |
| `specflow prepare --auto` | Same but skip interactive questions |
| `specflow generate` | Professional specs → production TypeScript |
| `specflow generate --dry-run` | Preview what would be generated |
| `specflow generate --force` | Skip the "did you prepare?" check |
| `specflow dev` | Generate + start dev server |
| `specflow list` | Show all endpoints from your specs |
| `specflow list --json` | Same but JSON output |
| `specflow setup` | Check what's installed and what's missing |

---

## ⚙️ LLM Setup

`specflow prepare` and `specflow generate` need an LLM provider. Pick one:

### Google Gemini (Recommended — Free tier available)
```bash
export GEMINI_API_KEY=your_key_here
```
Get a free key: https://ai.google.dev

### Anthropic Claude
```bash
export ANTHROPIC_API_KEY=your_key_here
```
Get a key: https://console.anthropic.com

### Local LlamaCpp (Offline, free)
```bash
export LLAMACPP_BASE_URL=http://localhost:8080/v1
```
Setup: https://github.com/ggml-org/llama.cpp

Or set it in `specflow.config.yaml`:
```yaml
llm:
  provider: "gemini"    # gemini | claude | llamacpp
  apiKey: "your-key"    # or use env vars above
```

---

## 📁 Complete Project Structure

```
my-api/
├── requirements/                  # YOUR SPECS
│   ├── *.md                       # Rough notes (you write these)
│   ├── business/                  # Professional business rules (AI creates these)
│   │   └── auth/
│   │       └── user-registration.req.md
│   ├── technical/                 # Professional API contracts (AI creates these)
│   │   └── auth/
│   │       └── POST-auth-register.contract.md
│   └── schemas/                   # Shared JSON schemas
│       └── user.schema.json
├── generated/                     # GENERATED CODE (specflow generate creates this)
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── db/
│   │   └── middleware/
│   ├── package.json
│   ├── Dockerfile
│   └── docker-compose.yml
├── specflow.config.yaml           # Configuration
└── .gitignore
```

**The rule:** You write in `requirements/`. SpecFlow generates in `generated/`. Never edit `generated/` — regenerate instead.

---

## 🔄 Iteration Workflow

```
1. Edit your specs (requirements/*.md or requirements/business/*.req.md)
2. specflow prepare     ← re-runs AI analysis
3. Review updated specs
4. specflow generate    ← regenerates code
5. specflow dev         ← test it
```

---

## 🔧 Generated Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| HTTP Framework | Hono |
| Database | PostgreSQL |
| ORM | Drizzle |
| Validation | Zod |
| Language | TypeScript (strict) |
| Container | Docker |

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

**Built by [Suhail Taj](https://github.com/suhailtajshaik)**
