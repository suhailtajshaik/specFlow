# User Registration Ideas

Just some rough notes on user registration:

- Users should be able to sign up with email and password
- Need to validate emails are real
- Passwords should be secure (not sure exact rules yet)
- Send verification email after signup
- Don't allow duplicate emails
- Return user info after successful registration

## Security thoughts
- Rate limit registration attempts
- Hash passwords obviously
- Maybe block disposable email domains?

## Questions
- What happens if verification email fails to send?
- Should we allow social login later?
