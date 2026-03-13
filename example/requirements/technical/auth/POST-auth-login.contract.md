---
method: POST
path: /api/v1/auth/login
requires_auth: false
rate_limit: 10/15min/ip
domain: auth
type: contract
status: active
---

# User Login Endpoint

Authenticate a user with email/username and password, returning a JWT token.

## Request

### Headers
- `Content-Type`: application/json

### Body Schema
Request schema: user-login.schema.json

```json
{
  "identifier": "user@example.com",
  "password": "SecurePassword123!"
}
```

### Validation Rules
- `identifier`: Required, can be email or username
- `password`: Required, non-empty string

### Authentication Methods
- Email + password
- Username + password
- Case-insensitive email lookup
- Case-sensitive username lookup

## Success Response (200 OK)

```json
{
  "status": 200,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "johndoe",
      "first_name": "John",
      "last_name": "Doe",
      "last_login": "2024-03-13T10:30:00Z",
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

### 400 Bad Request - Missing Fields
```json
{
  "status": 400,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "identifier": ["Identifier (email or username) is required"],
      "password": ["Password is required"]
    }
  }
}
```

### 401 Unauthorized - Invalid Credentials
```json
{
  "status": 401,
  "data": null,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The provided credentials are invalid",
    "details": {
      "attempts_remaining": 3,
      "lockout_warning": "Account will be temporarily locked after 2 more failed attempts"
    }
  }
}
```

### 401 Unauthorized - Account Locked
```json
{
  "status": 401,
  "data": null,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is temporarily locked due to too many failed login attempts",
    "details": {
      "locked_until": "2024-03-13T11:00:00Z",
      "retry_after": 900,
      "unlock_method": "automatic"
    }
  }
}
```

### 401 Unauthorized - Account Disabled
```json
{
  "status": 401,
  "data": null,
  "error": {
    "code": "ACCOUNT_DISABLED",
    "message": "This account has been disabled",
    "details": {
      "contact_support": "Please contact support for assistance"
    }
  }
}
```

### 422 Unprocessable Entity - Invalid Email Format
```json
{
  "status": 422,
  "data": null,
  "error": {
    "code": "INVALID_EMAIL_FORMAT",
    "message": "The provided email address format is invalid",
    "details": {
      "identifier": "invalid-email-format"
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
    "message": "Too many login attempts. Please try again later.",
    "details": {
      "retry_after": 900,
      "limit": "10 login attempts per 15 minutes"
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
    "code": "LOGIN_FAILED",
    "message": "Login could not be completed. Please try again.",
    "details": {}
  }
}
```

## Implementation Notes

### Authentication Flow
1. Validate request format and required fields
2. Determine if identifier is email or username
3. Look up user by identifier (case-insensitive for email)
4. Check account status (active, not locked)
5. Verify password using bcrypt
6. Check and update failed attempt counter
7. Generate JWT token on success
8. Update last_login timestamp

### Security Measures
- Rate limiting by IP address (10 attempts per 15 minutes)
- Account lockout after 5 failed attempts (15 minutes)
- Constant-time password comparison
- Failed attempt tracking per user
- Audit logging of all login attempts
- Generic error messages to prevent username enumeration

### Account Lockout Logic
- Track failed attempts per user account
- Lock account after 5 consecutive failed attempts
- 15-minute automatic lockout duration
- Reset failed attempt counter on successful login
- Admin can manually unlock accounts

### JWT Token Claims
```json
{
  "sub": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "iat": 1710331800,
  "exp": 1710418200
}
```

### Database Operations
1. Look up user by email or username
2. Verify account status and lockout status
3. Update failed_attempts counter
4. Update last_login timestamp on success
5. Log authentication attempt

### MCP Tools Required
- `db_find_user`: Look up user by email or username
- `verify_password`: Verify password against stored hash
- `generate_jwt`: Generate authentication token
- `db_update_user`: Update last_login and failed_attempts
- `cache_set`: Cache user session data (optional)

### Response Headers
- `Content-Type: application/json`
- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: When rate limit resets

### Error Handling Strategy
- Don't reveal whether email/username exists
- Provide helpful but secure error messages
- Track and limit failed attempts
- Log suspicious activity patterns
- Graceful degradation on system errors