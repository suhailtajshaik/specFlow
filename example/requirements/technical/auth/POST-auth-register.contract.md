---
method: POST
path: /api/v1/auth/register
requires_auth: false
rate_limit: 5/hour/ip
domain: auth
type: contract
status: active
---

# User Registration Endpoint

Register a new user account with email, username, and password.

## Request

### Headers
- `Content-Type`: application/json

### Body Schema
Request schema: user-registration.schema.json

```json
{
  "email": "user@example.com",
  "username": "johndoe", 
  "password": "SecurePassword123!",
  "first_name": "John",
  "last_name": "Doe"
}
```

### Validation Rules
- `email`: Required, valid email format, unique
- `username`: Required, 3-50 characters, alphanumeric + underscore/hyphen, unique
- `password`: Required, 8-128 characters, must contain uppercase, lowercase, number, special character
- `first_name`: Optional, max 100 characters, letters/spaces/hyphens/apostrophes only
- `last_name`: Optional, max 100 characters, letters/spaces/hyphens/apostrophes only

## Success Response (201 Created)

```json
{
  "status": 201,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
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

## Error Responses

### 400 Bad Request - Validation Errors
```json
{
  "status": 400,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": ["Invalid email format"],
      "password": ["Password must contain at least one uppercase letter"],
      "username": ["Username must be at least 3 characters"]
    }
  }
}
```

### 409 Conflict - Duplicate Email
```json
{
  "status": 409,
  "data": null,
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "An account with this email address already exists",
    "details": {
      "email": "user@example.com",
      "suggestion": "Try logging in or use a different email address"
    }
  }
}
```

### 409 Conflict - Duplicate Username
```json
{
  "status": 409,
  "data": null,
  "error": {
    "code": "USERNAME_EXISTS", 
    "message": "This username is already taken",
    "details": {
      "username": "johndoe",
      "suggestion": "Try a different username"
    }
  }
}
```

### 422 Unprocessable Entity - Weak Password
```json
{
  "status": 422,
  "data": null,
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password does not meet security requirements",
    "details": {
      "requirements": [
        "At least 8 characters",
        "At least one uppercase letter",
        "At least one lowercase letter", 
        "At least one number",
        "At least one special character"
      ],
      "failed": ["uppercase letter", "special character"]
    }
  }
}
```

### 429 Too Many Requests
```json
{
  "status": 429,
  "data": null,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many registration attempts. Please try again later.",
    "details": {
      "retry_after": 3600,
      "limit": "5 registrations per hour"
    }
  }
}
```

### 500 Internal Server Error
```json
{
  "status": 500,
  "data": null,
  "error": {
    "code": "REGISTRATION_FAILED",
    "message": "Registration could not be completed. Please try again.",
    "details": {}
  }
}
```

## Implementation Notes

### Database Operations
1. Check email uniqueness (case-insensitive)
2. Check username uniqueness (case-insensitive for checking, case-sensitive for storage)
3. Hash password using bcrypt with 12+ salt rounds
4. Insert user record with timestamp fields
5. Generate JWT token for immediate authentication

### Security Measures
- Input sanitization and validation
- Password hashing with bcrypt
- Rate limiting by IP address
- SQL injection prevention with parameterized queries
- XSS prevention with input sanitization

### Business Logic
- Implement all validation rules from business requirements
- Check against reserved username list
- Ensure proper error handling and rollback
- Send welcome/verification email (async)
- Log registration attempts for audit

### MCP Tools Required
- `hash_password`: Hash the user's password
- `db_create_user`: Create user record in database
- `generate_jwt`: Generate authentication token
- `send_email`: Send welcome email (optional)

### Headers Required in Response
- `Content-Type: application/json`
- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: When rate limit resets