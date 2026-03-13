# Order Creation

Basic e-commerce order flow:

• User must be logged in
• User selects products and quantities  
• System calculates total price
• User provides payment info
• System processes payment
• Order is created and confirmed
• User gets order confirmation

**Business rules:**
- Check product stock before creating order
- Don't trust price from client - calculate server-side
- Reserve inventory during order process
- Handle payment failures gracefully
- Send confirmation email

**Edge cases:**
- What if product goes out of stock during checkout?
- Payment succeeds but email fails?
- User closes browser during payment?
