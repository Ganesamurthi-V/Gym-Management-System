# WhatsApp Webhook - System Architecture

Detailed technical architecture of the WhatsApp Cloud API webhook integration.

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Meta WhatsApp Platform                       │
│                    (Cloud-hosted, managed by Meta)                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ HTTPS POST with signature
                                │ X-Hub-Signature-256: sha256=<hex>
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel Edge Network                          │
│                     (CDN, DDoS protection, SSL)                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js 15 API Route Handler                      │
│               /app/api/whatsapp/webhook/route.ts                     │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. Read Raw Body                              < 10ms         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 2. Verify HMAC SHA-256 Signature              < 5ms          │  │
│  │    - Constant-time comparison                                │  │
│  │    - Reject if invalid (401)                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 3. Parse & Validate JSON (Zod)                < 5ms          │  │
│  │    - Reject malformed (400)                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 4. Parse Events                               < 10ms         │  │
│  │    - Extract messages                                        │  │
│  │    - Extract statuses                                        │  │
│  │    - Extract contact names                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                │                                      │
│                   ┌────────────┴──────────────┐                      │
│                   ▼                            ▼                      │
│  ┌─────────────────────────┐   ┌──────────────────────────┐        │
│  │  Message Processor      │   │  Status Processor        │        │
│  │  (Services Layer)       │   │  (Services Layer)        │        │
│  └────────┬────────────────┘   └─────────┬────────────────┘        │
│           │                               │                          │
│           └───────────────┬───────────────┘                          │
│                           ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 5. Check Idempotency (Redis)              < 20ms             │  │
│  │    - Skip if duplicate                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 6. Persist to Database (Supabase)         < 100ms            │  │
│  │    - whatsapp_messages                                       │  │
│  │    - whatsapp_webhook_logs                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 7. Queue for Business Logic (Future)      < 10ms             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 8. Return 200 OK                          TOTAL: < 500ms     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴──────────┐
                    ▼                      ▼
        ┌────────────────────┐   ┌─────────────────┐
        │  Upstash Redis     │   │  Supabase DB    │
        │  (Idempotency)     │   │  (Persistence)  │
        └────────────────────┘   └─────────────────┘
```

## 📦 Component Architecture

### Layer 1: API Route Handler
```
app/api/whatsapp/webhook/route.ts
├── GET()  → Webhook verification
└── POST() → Event processing
```

**Responsibilities:**
- HTTP request/response handling
- Orchestration of processing pipeline
- Error handling at API boundary
- Logging and monitoring

### Layer 2: Security & Validation
```
lib/whatsapp/
├── verifyWebhook.ts     → GET verification
├── verifySignature.ts   → HMAC SHA-256 verification
└── webhookSchemas.ts    → Zod validation schemas
```

**Responsibilities:**
- Cryptographic signature verification
- Schema validation
- Input sanitization
- Attack prevention

### Layer 3: Parsing & Normalization
```
lib/whatsapp/
├── parseWebhook.ts      → Extract and normalize events
└── webhookTypes.ts      → TypeScript type definitions
```

**Responsibilities:**
- Parse Meta's payload format
- Normalize to internal format
- Extract contact information
- Handle all message types

### Layer 4: Business Logic
```
services/whatsapp/
├── messageProcessor.ts  → Process incoming messages
└── statusProcessor.ts   → Process status updates
```

**Responsibilities:**
- Message routing
- Business rule application
- Custom logic execution
- Queue management

### Layer 5: Data Access
```
repositories/whatsapp/
└── whatsappRepository.ts → Database operations
```

**Responsibilities:**
- CRUD operations
- Query optimization
- Transaction management
- Data mapping

### Layer 6: Infrastructure
```
config/
└── whatsapp.ts          → Environment configuration

lib/
├── redis.ts             → Redis client
├── supabase/            → Supabase client
└── logger.ts            → Structured logging
```

**Responsibilities:**
- Configuration management
- Client initialization
- Connection pooling
- Logging infrastructure

## 🔄 Data Flow Sequence

### Inbound Message Flow

```
Meta → POST webhook
  ↓
[1] Vercel Edge receives request
  ↓
[2] Next.js API route handler
  ↓
[3] Extract raw body (for signature)
  ↓
[4] Verify HMAC SHA-256 signature
  ↓ (if invalid) → 401 Unauthorized
  ↓
[5] Parse JSON payload
  ↓ (if invalid) → 400 Bad Request
  ↓
[6] Validate with Zod schema
  ↓ (if invalid) → 400 Bad Request
  ↓
[7] Extract messages & statuses
  ↓
[8] For each message:
  ├─ Check Redis idempotency
  │  └─ (if duplicate) → Skip
  ├─ Resolve gym from phone_number_id
  ├─ Save to whatsapp_messages table
  └─ Queue for business logic
  ↓
[9] Save webhook log
  ↓
[10] Return 200 OK (within 500ms)
```

### Status Update Flow

```
Meta → POST webhook (status update)
  ↓
[1-7] Same verification & parsing as message
  ↓
[8] For each status:
  ├─ Check Redis idempotency (message_id:status)
  │  └─ (if duplicate) → Skip
  ├─ Find message in database
  ├─ Update status field
  └─ Handle status-specific logic
     ├─ failed → Alert & log
     ├─ read → Track engagement
     └─ delivered → Update metrics
  ↓
[9] Save webhook log
  ↓
[10] Return 200 OK
```

## 🗄️ Database Schema

### Entity Relationship Diagram

```
┌─────────────────────┐
│      gyms           │
│─────────────────────│
│ id (PK)            │
│ name               │
│ owner_id           │
└──────┬──────────────┘
       │
       │ 1:1
       │
       ▼
┌─────────────────────┐         ┌──────────────────────┐
│ gym_whatsapp_config │         │  whatsapp_messages   │
│─────────────────────│         │──────────────────────│
│ id (PK)            │         │ id (PK)             │
│ gym_id (FK) ◄──────┼─────────┤ gym_id (FK)         │
│ phone_number_id    │    1:N  │ message_id (unique) │
│ phone_number       │         │ from_number         │
│ enabled            │         │ to_number           │
└────────────────────┘         │ direction           │
                                │ message_type        │
                                │ content             │
                                │ status              │
                                │ metadata (JSONB)    │
                                └─────────────────────┘

┌──────────────────────────┐
│ whatsapp_webhook_logs    │
│──────────────────────────│
│ id (PK)                 │
│ request_id              │
│ phone_number_id         │
│ event_type              │
│ payload (JSONB)         │
│ signature_valid         │
│ processed               │
│ processing_time_ms      │
└─────────────────────────┘
```

### Table Details

#### `whatsapp_messages`
- **Purpose**: Store all messages (inbound & outbound)
- **Indexes**: 
  - `message_id` (unique)
  - `gym_id`
  - `from_number`
  - `created_at DESC`
  - Composite: `(gym_id, created_at DESC)`
- **RLS**: Gym owners see only their messages

#### `whatsapp_webhook_logs`
- **Purpose**: Debug logs for all webhook events
- **Retention**: 7 days (auto-deleted)
- **Indexes**: 
  - `request_id`
  - `created_at DESC`
  - `processed`
- **RLS**: Admin-only access

#### `gym_whatsapp_config`
- **Purpose**: Per-gym WhatsApp configuration
- **Indexes**: 
  - `gym_id` (unique)
  - `phone_number_id` (unique)
- **RLS**: Gym owners manage their own config

## 🔐 Security Architecture

### Defense in Depth

```
Layer 1: Network
├─ Vercel DDoS protection
├─ Rate limiting at edge
└─ SSL/TLS encryption

Layer 2: Authentication
├─ HMAC SHA-256 signature
├─ Constant-time comparison
└─ Raw body verification

Layer 3: Authorization
├─ Gym-level data isolation
├─ RLS policies
└─ Service role key for webhooks

Layer 4: Input Validation
├─ Zod schema validation
├─ Type safety
└─ Sanitization

Layer 5: Idempotency
├─ Redis deduplication
├─ Database constraints
└─ Atomic operations

Layer 6: Output Security
├─ No secrets in logs
├─ Sanitized error messages
└─ CORS headers
```

### Signature Verification Flow

```
[Incoming Request]
      ↓
Extract X-Hub-Signature-256 header
      ↓
Read raw request body
      ↓
Compute HMAC SHA-256
  HMAC-SHA256(app_secret, raw_body)
      ↓
Compare with header signature
  crypto.timingSafeEqual(computed, header)
      ↓
  ┌─────┴─────┐
  ▼           ▼
Valid      Invalid
  ↓           ↓
Process    401 Unauthorized
```

## ⚡ Performance Optimization

### Target Metrics
- Total response time: <500ms (P95)
- Signature verification: <5ms
- Schema validation: <5ms
- Redis lookup: <20ms
- Database write: <100ms

### Optimization Strategies

1. **Minimize Blocking Operations**
   - Signature verification (fast crypto)
   - Schema validation (Zod is fast)
   - Redis atomic operations

2. **Database Optimization**
   - Proper indexes on all query fields
   - Batch inserts where possible
   - Connection pooling (Supabase)

3. **Redis Optimization**
   - Atomic SET NX EX operation
   - TTL-based cleanup
   - Cluster-ready design

4. **Async Processing**
   - Heavy work queued for later
   - Immediate 200 OK response
   - Background workers (future)

### Scaling Strategy

```
Horizontal Scaling:
├─ Next.js serverless functions (Vercel)
│  └─ Auto-scales based on traffic
├─ Redis cluster (Upstash)
│  └─ Distributed idempotency
└─ Database read replicas (Supabase)
   └─ Scale reads independently

Vertical Scaling:
├─ Database resources (CPU, RAM)
├─ Redis memory
└─ Function timeout/memory (if needed)

Queue-based Scaling (Future):
├─ Message queue (SQS, RabbitMQ)
├─ Background workers
└─ Independent scaling per component
```

## 🔍 Monitoring & Observability

### Metrics Pipeline

```
[Webhook Request]
      ↓
RequestLogger initialized
      ↓
Performance.now() timestamps
      ↓
Structured JSON logs
      ↓
  ┌─────┴─────┐
  ▼           ▼
Vercel      Sentry
Logs        Errors
  ↓           ↓
Log Drain   Error
(optional)  Tracking
```

### Key Metrics

1. **Request Metrics**
   - Total requests/min
   - Success rate
   - Error rate
   - Response time (P50, P95, P99)

2. **Processing Metrics**
   - Signature verification time
   - Validation time
   - Database write time
   - Redis lookup time

3. **Business Metrics**
   - Messages processed/hour
   - Status updates/hour
   - Duplicate detection rate
   - Error types distribution

4. **Infrastructure Metrics**
   - Function invocations
   - Database connections
   - Redis operations
   - Memory usage

## 🚀 Deployment Architecture

### Vercel Serverless

```
[Git Push]
    ↓
Vercel CI/CD
    ↓
Build Next.js app
    ↓
Deploy to edge locations
    ↓
Environment variables injected
    ↓
Functions deployed
    ↓
[Production Ready]
```

### Multi-Region Setup

```
         [Meta WhatsApp]
               ↓
        Vercel Edge Network
        (Auto-routing to nearest region)
               ↓
    ┌──────────┼──────────┐
    ▼          ▼          ▼
  US-East   EU-West   Asia-Pacific
    ↓          ↓          ↓
  [Shared Supabase Database]
    ↓          ↓          ↓
  [Shared Upstash Redis]
```

## 📈 Future Architecture

### Phase 2: Message Queue

```
[Webhook] → [Queue] → [Workers]
               ↓
           ┌───┴───┐
           ▼       ▼
        Worker  Worker
          Pool    Pool
           ↓       ↓
        Process Process
        Heavy   Heavy
        Work    Work
```

### Phase 3: Microservices

```
[API Gateway]
      ↓
  ┌───┴────┐
  ▼        ▼
Webhook  Message
Service  Service
  ↓        ↓
Auto-reply Template
Service   Service
```

---

**Version:** 1.0.0  
**Last Updated:** July 4, 2026  
**Architecture Review:** Quarterly
