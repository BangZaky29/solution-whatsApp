# WhatsApp Gateway API

Production-ready WhatsApp Gateway REST API using **Node.js**, **Express**, **@whiskeysockets/baileys**, and **Supabase** for session persistence.

## Features

- ✅ Session persistence in Supabase (survives restarts)
- ✅ QR code authentication via terminal or API
- ✅ Send text & media messages
- ✅ Bulk messaging support
- ✅ Auto-reconnection on disconnect
- ✅ Keep-alive mechanism

---

## Quick Start

### 1. Setup Database

Run this SQL in your [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS wa_sessions (
    id TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Or run the full schema from `db/schema.sql`.

### 2. Configure Environment

Edit `.env` file with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install & Run

```bash
npm install
npm run dev
```

### 4. Scan QR Code

Scan the terminal QR with WhatsApp → Linked Devices → Link a Device

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server info |
| GET | `/health` | Health check |
| GET | `/api/whatsapp/status` | Connection status |
| GET | `/api/whatsapp/qr` | Get QR code (base64 image) |
| GET | `/api/whatsapp/info` | Connected device info |
| POST | `/api/whatsapp/send` | Send text message |
| POST | `/api/whatsapp/send-media` | Send media message |
| POST | `/api/whatsapp/send-bulk` | Bulk messaging |
| POST | `/api/whatsapp/logout` | Logout & clear session |

---

## Usage Examples

### Send Text Message

```bash
curl -X POST http://localhost:3001/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"number":"628123456789","message":"Hello from Gateway!"}'
```

### Send Image

```bash
curl -X POST http://localhost:3001/api/whatsapp/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "number":"628123456789",
    "media":{
      "type":"image",
      "url":"https://example.com/image.jpg",
      "caption":"Check this out!"
    }
  }'
```

### Check Status

```bash
curl http://localhost:3001/api/whatsapp/status
```

---

## Session Persistence

This gateway uses Supabase to store Baileys authentication state:

- **Buffer Serialization**: All Buffer objects are converted to Base64 before saving to JSONB
- **Auto-Save**: Credentials are saved automatically on updates
- **Multi-Session**: Support multiple sessions via `SESSION_ID` env variable

---

## License

MIT
"# solution-whatsApp" 
