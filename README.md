# SpecFlow

[![npm version](https://badge.fury.io/js/specflow.svg)](https://badge.fury.io/js/specflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Generate production-ready TypeScript backends from markdown specifications using AI.

## 🚀 Quick Start

```bash
# Install globally
npm install -g specflow

# Or use with npx (no install needed)
npx specflow init my-api --example
cd my-api
npx specflow prepare
npx specflow generate
npx specflow dev
```

## ✨ What is SpecFlow?

SpecFlow transforms your rough API ideas into production-ready TypeScript backends. Write your specs in plain English, bullet points, or incomplete markdown—SpecFlow's AI will transform them into professional documentation and generate working code.

### The Magic: Prepare → Generate Pipeline

1. **Write rough specs** (bullet points, notes, anything!)
2. **`specflow prepare`** — AI transforms them into professional requirements
3. **`specflow generate`** — Creates production TypeScript backend
4. **`specflow dev`** — Start coding!

## 🏗️ What Gets Generated

Complete, production-ready backend with:

- 🔥 **Bun runtime** for blazing fast performance
- 🌐 **Hono web framework** lightweight and modern
- 🛢️ **Drizzle ORM** with PostgreSQL
- 🔒 **Zod validation** for request/response schemas
- 🚀 **TypeScript** with strict types throughout
- 🐳 **Docker** configuration included
- 🛡️ **Security** middleware and rate limiting
- ⚡ **Auto-generated** API routes with business logic

## 📋 Example Input → Output

### Input (rough notes):
```markdown
# User Registration

Users should register with email and password
- Validate emails are real
- Hash passwords
- Send verification email
- No duplicate emails
```

### Output (after `specflow prepare`):
Professional `.req.md` and `.contract.md` files with:
- Detailed business rules (BR-1, BR-2, etc.)
- Complete JSON schemas
- Error handling scenarios
- Security considerations

### Generated Code:
Production TypeScript with:
- Hono route handlers implementing all business logic
- Drizzle database schemas
- Zod validation
- Error handling
- Authentication middleware

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `specflow init [name]` | Initialize new project |
| `specflow prepare` | Transform rough specs → professional docs |
| `specflow generate` | Professional docs → TypeScript backend |
| `specflow dev` | Generate + start development server |
| `specflow list` | List all API endpoints |
| `specflow setup` | Check installation and requirements |

## 📁 Project Structure

```
my-api/
├── requirements/              # Your specifications
│   ├── business/             # Business requirements (.req.md)
│   ├── technical/            # API contracts (.contract.md)
│   └── schemas/              # Shared JSON schemas
├── generated/                # Generated backend (after specflow generate)
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── schemas/         # Zod validation schemas
│   │   ├── db/             # Database setup & migrations
│   │   ├── middleware/     # Auth, CORS, rate limiting
│   │   └── server.ts       # Main server
│   ├── package.json
│   ├── Dockerfile
│   └── docker-compose.yml
└── specflow.config.yaml      # SpecFlow configuration
```

## ⚙️ Configuration

Edit `specflow.config.yaml`:

```yaml
# LLM Provider
llm:
  provider: "gemini"          # gemini | claude | llamacpp
  apiKey: ""                  # or set via env vars

# Generated code settings
output:
  directory: "./generated"
  runtime: "bun"             
  framework: "hono"          
  orm: "drizzle"             
  database: "postgresql"     
  includeDocker: true        

# Requirements location
requirements:
  directory: "./requirements"
  businessDir: "business"    
  technicalDir: "technical"  
  schemasDir: "schemas"      
```

## 🤖 LLM Providers

### Google Gemini (Recommended)
```bash
# Free tier available
export GEMINI_API_KEY=your_key_here
# Get key: https://ai.google.dev
```

### Anthropic Claude
```bash
export ANTHROPIC_API_KEY=your_key_here
# Get key: https://console.anthropic.com
```

### Local LlamaCpp
```bash
export LLAMACPP_BASE_URL=http://localhost:8080/v1
# Setup: https://github.com/ggerganov/llama.cpp
```

## 📦 Installation Requirements

- **Node.js 18+** (for SpecFlow CLI)
- **Bun 1.0+** (for generated code)

SpecFlow will guide you through installation if anything is missing.

## 💡 Examples

### E-commerce API
```bash
npx specflow init shop-api --example
cd shop-api
npx specflow prepare  # Review the example specs
npx specflow generate # Creates full e-commerce backend
npx specflow dev      # Start development
```

### From Scratch
```bash
npx specflow init my-api
cd my-api

# Add your rough specs
echo "# User Management
- Users register with email/password
- Users can login and get JWT tokens  
- Users have profiles with name/avatar
- Admin users can manage other users" > requirements/users.md

npx specflow prepare  # AI creates professional specs
npx specflow generate # Generates working backend
```

## 🏃‍♂️ Development Workflow

1. **Start rough**: Write specs in plain English
2. **Prepare**: `specflow prepare` makes them professional
3. **Review**: Check generated `.req.md` and `.contract.md` files
4. **Generate**: `specflow generate` creates backend code
5. **Develop**: `specflow dev` starts the development server
6. **Iterate**: Update specs and regenerate as needed

## 🔧 Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | Hono |
| Database | PostgreSQL |
| ORM | Drizzle |
| Validation | Zod |
| Language | TypeScript |
| Containerization | Docker |

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://github.com/suhailtajshaik/specflow/wiki)
- 🐛 [Issue Tracker](https://github.com/suhailtajshaik/specflow/issues)
- 💬 [Discussions](https://github.com/suhailtajshaik/specflow/discussions)

---

**Built with ❤️ by [Suhail Taj](https://github.com/suhailtajshaik)**