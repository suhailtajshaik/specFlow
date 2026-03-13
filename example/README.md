# E-Commerce API Example

This is a complete example e-commerce API built with the LLM Backend Framework. It demonstrates how to build a production-ready backend using only markdown specification files.

## Overview

This example implements a simple e-commerce platform with the following features:

- **User Authentication**: Registration and login with JWT tokens
- **Order Management**: Create orders with multiple items
- **Product Catalog**: Products with stock management
- **Payment Processing**: Basic payment method support

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register a new user account
- `POST /api/v1/auth/login` - Login with email/username and password

### Orders
- `POST /api/v1/orders` - Create a new order (authenticated)

## Project Structure

```
example/
├── requirements/
│   ├── business/           # Business rules and requirements
│   │   ├── auth/
│   │   │   ├── user-registration.req.md
│   │   │   └── user-login.req.md
│   │   └── orders/
│   │       └── create-order.req.md
│   ├── technical/          # API contracts and specifications
│   │   ├── auth/
│   │   │   ├── POST-auth-register.contract.md
│   │   │   └── POST-auth-login.contract.md
│   │   └── orders/
│   │       └── POST-orders.contract.md
│   └── schemas/           # JSON schemas for validation
│       ├── user.schema.json
│       └── order.schema.json
├── project.config.yaml    # Project configuration
└── README.md             # This file
```

## Business Rules

### User Registration (BR-1 to BR-7)
- Email validation and uniqueness
- Password security requirements (8+ chars, mixed case, numbers, special chars)
- Username requirements (3-50 chars, alphanumeric + underscore/hyphen)
- Input validation and sanitization
- Rate limiting (5 registrations per hour per IP)

### User Login (BR-1 to BR-11)
- Multiple authentication methods (email or username)
- Account lockout after 5 failed attempts
- JWT token generation and management
- Audit logging and monitoring
- Rate limiting (10 attempts per 15 minutes per IP)

### Order Creation (BR-1 to BR-14)
- Authentication required
- Stock availability checking
- Price validation with tolerance
- Order total validation ($10 minimum, $10k maximum)
- Inventory management with stock deduction
- Order status management

## API Examples

### Register a New User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "username": "johndoe",
    "password": "SecurePass123!",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

Response:
```json
{
  "status": 201,
  "data": {
    "user": {
      "id": 1,
      "email": "john@example.com",
      "username": "johndoe",
      "first_name": "John",
      "last_name": "Doe",
      "created_at": "2024-03-13T10:30:00Z",
      "is_active": true
    },
    "token": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "token_type": "Bearer",
      "expires_at": "2024-03-14T10:30:00Z",
      "expires_in": 86400
    }
  },
  "error": null
}
```

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "john@example.com",
    "password": "SecurePass123!"
  }'
```

### Create an Order

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "items": [
      {
        "product_id": 1,
        "quantity": 1,
        "unit_price": 2499.00
      },
      {
        "product_id": 2,
        "quantity": 2,
        "unit_price": 999.00
      }
    ],
    "shipping_address": {
      "street": "123 Tech Street",
      "city": "San Francisco",
      "state": "CA",
      "postal_code": "94105",
      "country": "US"
    },
    "payment_method": "credit_card"
  }'
```

## Database Schema

The example uses PostgreSQL with the following main tables:

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
```

### Orders Table
```sql
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending',
    items JSONB NOT NULL,
    shipping_address JSONB,
    payment_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Products Table
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Running the Example

1. **Start the Framework**:
```bash
cd /root/projects/llm-backend-framework
docker compose up -d
```

2. **Build the Vector Index**:
```bash
bun run build:index
```

3. **Test the API**:
```bash
# Register a user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "username": "testuser", "password": "TestPass123!"}'

# Create an order (use token from registration response)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"items": [{"product_id": 1, "quantity": 1, "unit_price": 2499.00}], "shipping_address": {"street": "123 Main St", "city": "San Francisco", "state": "CA", "postal_code": "94105", "country": "US"}, "payment_method": "credit_card"}'
```

## Key Features Demonstrated

### 1. **No Code Required**
The entire API is defined using markdown files with YAML frontmatter. No traditional backend code needed.

### 2. **RAG-Powered Processing**
Requests are processed by:
- Embedding the request method and path
- Retrieving relevant specifications from the vector database
- Using an LLM to process the request according to the specifications
- Executing MCP tools for data operations

### 3. **Production-Ready Features**
- Input validation with JSON schemas
- Authentication and authorization
- Rate limiting
- Error handling
- Database transactions
- Audit logging

### 4. **Extensibility**
New endpoints can be added by simply creating new markdown specification files. The system automatically picks them up after rebuilding the vector index.

## Error Handling

The API provides comprehensive error handling with specific error codes:

- **400 Bad Request**: Validation errors, missing required fields
- **401 Unauthorized**: Authentication required, invalid credentials
- **404 Not Found**: Resource not found (products, users)
- **409 Conflict**: Duplicate data, stock conflicts
- **422 Unprocessable Entity**: Business rule violations
- **429 Too Many Requests**: Rate limiting
- **500 Internal Server Error**: System errors

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting by IP and user
- Input validation and sanitization
- SQL injection prevention
- Account lockout mechanisms
- Audit logging

## Next Steps

This example can be extended with:

- Additional endpoints (user profile, order history, product catalog)
- Payment processing integration
- Email notifications
- Order tracking and status updates
- Admin functionality
- Advanced search and filtering