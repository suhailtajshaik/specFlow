---
domain: auth
type: requirement
status: active
priority: high
---

# User Login Requirements

This document defines the business rules for user authentication in the e-commerce platform.

## BR-1: Authentication Methods

The system supports the following authentication methods:

- **Email + Password**: Primary authentication method
- **Username + Password**: Alternative authentication method
- **Case Insensitive**: Email lookup should be case-insensitive
- **Future Enhancement**: OAuth integration (Google, GitHub, etc.)

## BR-2: Credential Validation

Login credential validation requirements:

- **Email Format**: If using email, must be valid email format
- **Required Fields**: Both identifier (email/username) and password are required
- **Input Sanitization**: All inputs must be sanitized to prevent injection attacks
- **Trim Whitespace**: Remove leading/trailing whitespace from inputs

## BR-3: Password Verification

Password verification process:

- **Secure Comparison**: Use bcrypt to verify password against stored hash
- **Timing Attack Prevention**: Use constant-time comparison
- **Failed Attempts**: Track failed login attempts per user
- **Account Lockout**: Temporary lockout after 5 consecutive failed attempts (15-minute lockout)
- **No Password Leakage**: Never include password information in logs or responses

## BR-4: Account Status Validation

Before authentication, verify account status:

- **Active Account**: User account must be active (`is_active = true`)
- **Email Verification**: Account email should be verified (future requirement)
- **Account Suspension**: Check if account is temporarily or permanently suspended
- **Deletion Status**: Ensure account hasn't been marked for deletion

## BR-5: JWT Token Generation

Upon successful authentication:

- **Token Creation**: Generate JWT token with appropriate claims
- **Expiration**: Token expires in 24 hours by default
- **Claims Include**:
  - `sub`: User ID
  - `email`: User email
  - `username`: Username
  - `iat`: Issued at timestamp
  - `exp`: Expiration timestamp
- **Secure Secret**: Use strong JWT secret from environment variables

## BR-6: Login Response

Successful login response must include:

- **User Information**: ID, email, username, first_name, last_name
- **Authentication Token**: JWT token for subsequent requests
- **Token Expiration**: When the token expires
- **Last Login**: Update and return last login timestamp
- **No Sensitive Data**: Never include password hash or other sensitive information

## BR-7: Failed Login Handling

Failed login attempt handling:

- **Increment Counter**: Track failed attempts for the user account
- **Rate Limiting**: Limit login attempts per IP address (10 attempts per 15 minutes)
- **Clear Error Messages**: Provide helpful but secure error messages
- **Audit Logging**: Log all login attempts (success and failure) with IP address
- **Generic Errors**: Don't reveal whether email/username exists

**Error Scenarios:**
- Invalid email format
- User not found
- Incorrect password
- Account locked/disabled
- Too many failed attempts

## BR-8: Security Measures

Additional security considerations:

- **Brute Force Protection**: Progressive delays and account lockouts
- **IP Rate Limiting**: Limit attempts per IP address
- **User Agent Tracking**: Log user agent for suspicious activity detection
- **Session Management**: Proper token invalidation on logout
- **HTTPS Only**: All authentication must happen over HTTPS in production

## BR-9: Account Lockout Rules

Account lockout mechanism:

- **Threshold**: 5 consecutive failed password attempts
- **Lockout Duration**: 15 minutes automatic unlock
- **Admin Override**: Support team can manually unlock accounts
- **Lockout Notification**: Optional email notification of account lockout
- **Counter Reset**: Reset failed attempts counter on successful login

## BR-10: Audit and Monitoring

Login activity monitoring:

- **Successful Logins**: Log IP, user agent, timestamp
- **Failed Attempts**: Log attempted identifier, IP, reason for failure
- **Suspicious Activity**: Flag unusual patterns (location, timing, frequency)
- **PII Protection**: Ensure logs don't contain sensitive information
- **Retention**: Keep audit logs for security analysis and compliance

## BR-11: Performance Requirements

Authentication performance standards:

- **Response Time**: Login should complete within 500ms under normal load
- **Database Efficiency**: Optimize user lookup queries with proper indexes
- **Caching**: Cache user data appropriately to reduce database load
- **Scalability**: Design to handle thousands of concurrent login attempts