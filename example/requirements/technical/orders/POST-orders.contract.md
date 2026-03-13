---
method: POST
path: /api/v1/orders
requires_auth: true
rate_limit: 20/hour/user
domain: orders
type: contract
status: active
---

# Create Order Endpoint

Create a new order with items, shipping address, and payment information.

## Request

### Headers
- `Content-Type`: application/json
- `Authorization`: Bearer {jwt_token}

### Body Schema
Request schema: create-order.schema.json

```json
{
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "unit_price": 999.00
    },
    {
      "product_id": 3,
      "quantity": 1,
      "unit_price": 49.99
    }
  ],
  "shipping_address": {
    "street": "123 Main Street",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94105",
    "country": "US"
  },
  "payment_method": "credit_card"
}
```

### Validation Rules
- `items`: Required array, 1-50 items maximum
  - `product_id`: Required integer, must exist and be active
  - `quantity`: Required integer, 1-999, must not exceed available stock
  - `unit_price`: Required decimal, must match current product price (±5% tolerance)
- `shipping_address`: Required object
  - `street`: Required string, max 255 characters
  - `city`: Required string, max 100 characters
  - `state`: Required string, max 100 characters
  - `postal_code`: Required string, format validated
  - `country`: Required string, ISO 3166-1 alpha-2 code
- `payment_method`: Required enum: credit_card, debit_card, bank_transfer, digital_wallet

## Success Response (201 Created)

```json
{
  "status": 201,
  "data": {
    "order": {
      "id": 1001,
      "user_id": 1,
      "status": "pending",
      "total_amount": 2097.99,
      "currency": "USD",
      "items": [
        {
          "product_id": 1,
          "product_name": "iPhone 15 Pro",
          "quantity": 2,
          "unit_price": 999.00,
          "subtotal": 1998.00
        },
        {
          "product_id": 3,
          "product_name": "Design Patterns",
          "quantity": 1,
          "unit_price": 49.99,
          "subtotal": 49.99
        }
      ],
      "shipping_address": {
        "street": "123 Main Street",
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94105",
        "country": "US"
      },
      "payment_method": "credit_card",
      "created_at": "2024-03-13T10:30:00Z",
      "updated_at": "2024-03-13T10:30:00Z",
      "confirmation_number": "ORD-2024-1001-ABC123"
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
      "items": ["At least one item is required"],
      "shipping_address.postal_code": ["Invalid postal code format"],
      "items[0].quantity": ["Quantity must be between 1 and 999"]
    }
  }
}
```

### 400 Bad Request - Empty Order
```json
{
  "status": 400,
  "data": null,
  "error": {
    "code": "EMPTY_ORDER",
    "message": "Order must contain at least one item",
    "details": {}
  }
}
```

### 404 Not Found - Invalid Product
```json
{
  "status": 404,
  "data": null,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "One or more products in the order were not found",
    "details": {
      "invalid_products": [999],
      "valid_products": [1, 3]
    }
  }
}
```

### 409 Conflict - Insufficient Stock
```json
{
  "status": 409,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for one or more items",
    "details": {
      "out_of_stock": [
        {
          "product_id": 1,
          "product_name": "iPhone 15 Pro",
          "requested": 5,
          "available": 2
        }
      ]
    }
  }
}
```

### 422 Unprocessable Entity - Price Mismatch
```json
{
  "status": 422,
  "data": null,
  "error": {
    "code": "PRICE_MISMATCH",
    "message": "Product prices have changed since cart was created",
    "details": {
      "price_changes": [
        {
          "product_id": 1,
          "product_name": "iPhone 15 Pro",
          "provided_price": 999.00,
          "current_price": 1099.00
        }
      ]
    }
  }
}
```

### 422 Unprocessable Entity - Order Too Small
```json
{
  "status": 422,
  "data": null,
  "error": {
    "code": "ORDER_BELOW_MINIMUM",
    "message": "Order total is below the minimum required amount",
    "details": {
      "order_total": 5.99,
      "minimum_required": 10.00
    }
  }
}
```

### 422 Unprocessable Entity - Order Too Large
```json
{
  "status": 422,
  "data": null,
  "error": {
    "code": "ORDER_ABOVE_MAXIMUM",
    "message": "Order total exceeds the maximum allowed amount",
    "details": {
      "order_total": 15000.00,
      "maximum_allowed": 10000.00
    }
  }
}
```

### 401 Unauthorized
```json
{
  "status": 401,
  "data": null,
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Valid authentication token is required",
    "details": {}
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
    "message": "Too many order creation attempts",
    "details": {
      "retry_after": 3600,
      "limit": "20 orders per hour"
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
    "code": "ORDER_CREATION_FAILED",
    "message": "Order could not be created. Please try again.",
    "details": {}
  }
}
```

## Implementation Notes

### Order Creation Flow
1. Authenticate user and extract user ID from JWT
2. Validate request structure and required fields
3. Verify all products exist and are active
4. Check stock availability for all items
5. Validate price consistency (±5% tolerance)
6. Calculate order totals and validate minimums/maximums
7. Create order record with transaction
8. Deduct stock quantities
9. Generate confirmation number
10. Send order confirmation email

### Business Logic Validation
- Minimum order value: $10.00
- Maximum order value: $10,000.00
- Maximum items per order: 50
- Stock reservation during order processing
- Price tolerance: ±5% from current product price

### Database Transaction Flow
```sql
BEGIN;
-- 1. Insert order record
-- 2. Insert order items
-- 3. Update product stock quantities
-- 4. Verify stock constraints
COMMIT; -- or ROLLBACK on failure
```

### Stock Management
- Check available stock before order creation
- Reserve stock during transaction
- Deduct stock on successful order
- Release reserved stock on failure
- Handle concurrent order race conditions

### Order Calculations
```javascript
itemSubtotal = quantity × unit_price
orderSubtotal = sum(itemSubtotals)
tax = orderSubtotal × taxRate // future
shipping = calculateShipping(address) // future
totalAmount = orderSubtotal + tax + shipping
```

### MCP Tools Required
- `db_find_user`: Verify authenticated user exists
- `db_query`: Check product existence and stock levels
- `db_create_order`: Create order and order items
- `db_update_product`: Update stock quantities
- `generate_token`: Generate confirmation number
- `send_email`: Send order confirmation email
- `cache_set`: Cache order data for performance

### Security Measures
- JWT token validation
- User authorization (orders belong to authenticated user)
- Input validation and sanitization
- SQL injection prevention
- Rate limiting per user
- Audit logging of order attempts

### Response Headers
- `Content-Type: application/json`
- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: When rate limit resets
- `Location`: /api/v1/orders/{order_id} (for created resource)

### Error Recovery
- Rollback database changes on failure
- Release reserved stock
- Log error details for debugging
- Return user-friendly error messages
- Maintain data consistency