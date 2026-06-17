# Googletine

Payment-based proxy node for circumventing loginwalls and paywalls.

## Architecture

- **Server**: Accepts requests from clients, validates payments, serves content with cookie injection
- **Client**: Forwards browser requests to server nodes, handles payment flow

## Quick Start

```bash
# Install dependencies
npm install

# Start server (port 7000)
npm run start-server

# Start client (port 6000)
npm run start-client
```

## Testing

```bash
# Test server health
curl http://localhost:7000/health

# Test client info
curl http://localhost:6000/

# Test payment flow
curl "http://localhost:6000/request?url=https://example.com"
```

## Payment Flow

1. Client forwards request to server without payment
2. Server returns 402 with payment request
3. Client executes payment (stubbed for now)
4. Client retries request with payment
5. Server validates payment and serves content

## TODO: MPP Integration

The payment functions in `shared/payments/stub.js` are placeholders for MPP integration:
- `doPayment()` - Client-side payment execution
- `receivePayment()` - Server-side payment validation
- `requestPayment()` - Server-side payment request generation

## Configuration

Environment variables:
- `GOOGLETINE_SERVER_PORT` - Server port (default: 7000)
- `GOOGLETINE_CLIENT_PORT` - Client port (default: 6000)
