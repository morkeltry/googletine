# Googletine

MPP-based proxy system for escaping your filter bubble!

## Overview

Googletine is a distributed proxy system that uses personas (user identities with cookies) to make requests to services like YouTube and Twitter. It processes payments for requests and serves content with modified headers (like cookie injection) to bypass restrictions.

## Architecture

```
┌─────────────┐      Payment      ┌──────────────┐
│  Browser/Web │ ─────────────────→ │   Server     │ ───→ YouTube/Twitter
│    Client     │ ← 402 + Payment   │  (Node.js)   │      (using personas)
└─────────────┘                    └──────────────┘
                                              ↑
                                              │
┌─────────────┐                    ┌──────────────┐
│     CLI      │ ← manages personas │  Database    │
│  (guil-cli)  │                    │   (JSON)      │
└─────────────┘                    └──────────────┘
```

## Components

### Server (`server/`)
- Express.js server that accepts requests and validates payments
- Loads personas from database on startup
- Uses personas when making requests to YouTube/Twitter
- Returns 402 with payment request if no payment provided
- Accepts payments and serves content

### Client (`client/`)
- Express.js client that forwards browser requests to server
- Handles payment retry loop (402 → pay → retry)
- Streams responses back to browser

### Shared (`shared/`)
- **Payment stubs** - Fake payment system ready for MPP integration
- **Persona management** - Modular, provider-agnostic persona system
- **Provider implementations** - YouTube, Twitter (extensible)

### CLI (`guil-cli.js`)
- Create, list, delete personas
- Make test requests using specific personas
- View statistics and configuration
- Control verbosity levels

## Installation

```bash
npm install
```

## Usage

### Start the Server

```bash
npm run start-server
```

Server runs on port 7000 (configurable via `GOOGLETINE_SERVER_PORT`).

### Start the Client

```bash
npm run start-client
```

Client runs on port 6000 (configurable via `GOOGLETINE_CLIENT_PORT`).

### CLI Commands

#### Command Syntax

```bash
# Direct usage
node guil-cli.js <command> [arguments...]

# Via npm script
npm run persona -- <command> [arguments...]
```

#### Available Commands

**help** - Show help message
```bash
node guil-cli.js help
```

**create** - Create a new persona
```bash
node guil-cli.js create <provider> <search-term> [name]
```
- `<provider>` - Provider name: `youtube`, `twitter`
- `<search-term>` - Search query to initialize persona
- `[name]` - Optional persona name (defaults to search term)

**list** - List personas
```bash
node guil-cli.js list [provider] [persona-id]
```
- `[provider]` - Optional provider filter (youtube, twitter)
- `[persona-id]` - Optional specific persona ID to show details

**request** - Make a test request using a persona
```bash
node guil-cli.js request <provider> <persona-id> <search-term>
```
- `<provider>` - Provider name: `youtube`, `twitter`
- `<persona-id>` - Specific persona ID to use
- `<search-term>` - Search query for the request

**config** - View or change configuration
```bash
node guil-cli.js config [key] [value]
```
- `[key]` - Config key (currently only `verbosity`)
- `[value]` - New value for the key

**delete** - Delete a persona
```bash
node guil-cli.js delete <provider> <persona-id>
```
- `<provider>` - Provider name
- `<persona-id>` - Persona ID to delete

**stats** - Show statistics
```bash
node guil-cli.js stats [provider]
```
- `[provider]` - Optional provider filter

#### Examples

```bash
# Create a YouTube persona
node guil-cli.js create youtube "pigs" "Pig Research"

# List all personas
node guil-cli.js list

# List YouTube personas
node guil-cli.js list youtube

# Show specific persona details
node guil-cli.js list youtube persona-1781711823510-d7ytm25gr

# Delete a persona
node guil-cli.js delete youtube persona-1781711823510-d7ytm25gr

# Make a test request
node guil-cli.js request youtube persona-1781711823510-d7ytm25gr "funny cats"

# Change verbosity to json
node guil-cli.js config verbosity json

# View current config
node guil-cli.js config

# Show statistics for YouTube
node guil-cli.js stats youtube
```

### Verbosity Levels (for request command)

- `titles` - Show video titles (default)
- `stats` - Show response statistics (size, lines, titles count)
- `html` - Show HTML preview (2KB)
- `full` - Show full HTML response
- `json` - Show structured YouTube data (ytInitialData)

## API Endpoints

### Server Endpoints

- `POST /request` - Main request endpoint (accepts JSON with `url`, `payment`, `personaId`)
- `GET /personas` - List all loaded personas
- `GET /personas/stats` - Show server statistics
- `POST /personas/reload` - Reload personas from database
- `GET /health` - Health check

### Request Body Format

```json
{
  "url": "https://www.youtube.com/results?search_query=pigs",
  "payment": {
    "success": true,
    "transactionId": "cli-1234567890",
    "amount": 1000
  },
  "personaId": "persona-1781711823510-d7ytm25gr"
}
```

## Persona System

Each persona represents a unique user identity with:
- **Cookies** - Stored from responses to YouTube/Twitter
- **Headers** - Provider-specific request headers
- **State** - Provider-specific state (consent, visitor IDs, etc.)
- **Request count** - Number of times persona has been used

### YouTube Tracking Cookies

The system tracks these key YouTube cookies:
- `CONSENT` - Cookie consent preference
- `VISITOR_INFO1_LIVE` - Main visitor identifier
- `YSC` - Session state (changes per request)
- `__Secure-YEC` - Encrypted user data
- `__Secure-YENID` - Encrypted session ID
- `VISITOR_PRIVACY_METADATA` - Privacy consent metadata

## Database

Personas are stored in `server/data/.googletine-db.json`.

When you create/delete personas via CLI, the server is automatically reloaded to pick up changes.

## Testing

```bash
# Run CLI tests
npm test
```

Tests cover:
- Persona creation
- Listing personas
- Deleting personas
- Statistics
- Configuration changes
- Full persona lifecycle

## Configuration

### Environment Variables

- `GOOGLETINE_SERVER_PORT` - Server port (default: 7000)
- `GOOGLETINE_CLIENT_PORT` - Client port (default: 6000)
- `GOOGLETINE_SERVER_URL` - Server URL for CLI (default: http://localhost:7000)

### Configuration File

The CLI stores configuration in `.googletine-config.json`:
- `verbosity` - Output verbosity level for requests

## Provider Support

Currently supports:
- ✅ **YouTube** - Full persona management and request handling
- ✅ **Twitter** - Persona management ready (request handling basic)

Adding new providers:
1. Create provider class in `shared/providers/`
2. Implement provider-specific persona and manager classes
3. Add to `shared/providers/index.js` factory

## TODO / Future Work

### Critical
- [ ] Integrate actual MPP payment system (replace stubs)
- [ ] Add content validation tests
- [ ] Implement TLS/encryption for secure sessions

### Important
- [ ] Client should use personas for requests (currently doesn't)
- [ ] Implement persona rotation strategy in production
- [ ] Add session management integration
- [ ] Improve error handling and retry logic

### Nice to Have
- [ ] Add more providers (Reddit, etc.)
- [ ] Persona pool size limits and cleanup
- [ ] Request rate limiting per persona
- [ ] Detailed logging and metrics
- [ ] Web UI for persona management

## Development

### Project Structure

```
googletine/
├── server/              # Server (accepts requests, uses personas)
│   ├── data/
│   │   └── .googletine-db.json  # Persona database
│   └── express/src/
│       ├── acceptPageRequest.js
│       ├── openSession.js
│       └── server.js
├── client/              # Client (forwards requests to server)
│   └── express/src/
│       ├── forwardRequest.js
│       └── server.js
├── shared/              # Shared functionality
│   ├── payments/
│   │   ├── stub.js      # Payment stubs (MPP integration point)
│   │   └── headers.js   # Payment header helpers
│   ├── personas/
│   │   ├── Persona.js   # Base persona class
│   │   └── PersonaManager.js
│   └── providers/
│       ├── index.js     # Provider factory
│       ├── youtube.js    # YouTube implementation
│       └── twitter.js    # Twitter implementation
├── guil-cli.js          # CLI for persona management
├── test-cli.js          # CLI tests
└── package.json
```

## License

ISC
