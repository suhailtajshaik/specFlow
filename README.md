# LLM Backend Framework

A generic, reusable backend engine where project teams write markdown files instead of code, and an LLM serves API requests.

## Overview

This framework allows you to build backend APIs by writing markdown specification files instead of traditional code. The system uses RAG (Retrieval-Augmented Generation) to find relevant contract and business rule documents, then uses an LLM to process requests and generate responses.

## Architecture

- **Gateway**: Bun + Hono API server with RAG pipeline
- **MCP Servers**: Modular tools for database, HTTP, email, auth, and cache operations
- **Build Pipeline**: Converts markdown specs into a vector database for retrieval
- **Vector DB**: Qdrant for storing and searching embedded specifications

## Quick Start

1. **Clone and Install**:
```bash
git clone <repo>
cd llm-backend-framework
bun install
```

2. **Configure Environment**:
```bash
cp framework/docker/.env.example .env
# Edit .env with your settings
```

3. **Start Development Stack**:
```bash
bun run dev
# This starts the local profile with llamacpp
```

4. **Build Vector Index**:
```bash
bun run build:index
```

5. **Test the API**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepass123"}'
```

## Project Structure

```
llm-backend-framework/
├── framework/          # Core framework components
│   ├── gateway/        # API gateway with RAG pipeline
│   ├── mcp-servers/    # Tool servers for various functions
│   ├── build/          # Vector DB build pipeline
│   └── docker/         # Docker configuration
├── example/           # Example e-commerce API project
└── README.md          # This file
```

## Writing Specifications

### Business Requirements (*.req.md)
Define business rules and logic:

```markdown
---
domain: auth
type: requirement
status: active
---

# User Registration Requirements

## BR-1: Email Validation
All user emails must be valid and unique...

## BR-2: Password Strength
Passwords must be at least 8 characters...
```

### API Contracts (*.contract.md)
Define API endpoints and schemas:

```markdown
---
method: POST
path: /api/v1/auth/register
requires_auth: false
rate_limit: 5/hour/ip
---

# User Registration Endpoint

Request schema: user.schema.json
Response schema: registration-response.schema.json
```

## Docker Profiles

- **default**: Gateway + Qdrant + MCP servers
- **local**: + llamacpp server for local LLM
- **vllm-cpu**: + vLLM CPU inference server
- **vllm-gpu**: + vLLM GPU inference server (requires NVIDIA)

## Environment Variables

See `framework/docker/.env.example` for all configuration options.

## MCP Servers

The framework includes 5 MCP servers providing tools for:
- **postgres**: Database operations
- **http-api**: External HTTP calls
- **email**: SMTP email sending
- **auth**: Authentication utilities
- **cache**: Redis caching

## License

MIT