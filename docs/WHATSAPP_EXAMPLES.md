# WhatsApp Webhook - Example Payloads & Testing

Complete reference of example webhook payloads and testing commands.

## 📋 Table of Contents

- [Verification Examples](#verification-examples)
- [Message Examples](#message-examples)
- [Status Update Examples](#status-update-examples)
- [Error Examples](#error-examples)
- [Testing Commands](#testing-commands)

---

## Verification Examples

### Webhook Verification (GET Request)

Meta sends this during webhook setup:

```
GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE_STRING
```

Expected response:
```
200 OK
Content-Type: text/plain

CHALLENGE_STRING
```

### Test Locally

```bash
curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

---

## Message Examples

### 1. Text Message

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "contacts": [{
          "profile": {
            "name": "John Doe"
          },
          "wa_id": "14155238886"
        }],
        "messages": [{
          "from": "14155238886",
          "id": "wamid.HBgLMTQxNTUyMzg4ODYVAgARGBIzQzY5RjREQzE1QjdGQjcwMTcA",
          "timestamp": "1702483200",
          "type": "text",
          "text": {
            "body": "Hello! I'd like to book a class."
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 2. Image Message with Caption

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "contacts": [{
          "profile": {
            "name": "Jane Smith"
          },
          "wa_id": "14155238886"
        }],
        "messages": [{
          "from": "14155238886",
          "id": "wamid.IMAGE123456",
          "timestamp": "1702483200",
          "type": "image",
          "image": {
            "id": "987654321",
            "mime_type": "image/jpeg",
            "sha256": "abc123def456...",
            "caption": "My progress photo!"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 3. Video Message

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.VIDEO123456",
          "timestamp": "1702483200",
          "type": "video",
          "video": {
            "id": "987654321",
            "mime_type": "video/mp4",
            "sha256": "abc123def456..."
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 4. Audio Message

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.AUDIO123456",
          "timestamp": "1702483200",
          "type": "audio",
          "audio": {
            "id": "987654321",
            "mime_type": "audio/ogg; codecs=opus",
            "sha256": "abc123def456..."
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 5. Document Message

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.DOC123456",
          "timestamp": "1702483200",
          "type": "document",
          "document": {
            "id": "987654321",
            "mime_type": "application/pdf",
            "sha256": "abc123def456...",
            "filename": "membership-form.pdf",
            "caption": "Filled membership form"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 6. Location Message

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.LOC123456",
          "timestamp": "1702483200",
          "type": "location",
          "location": {
            "latitude": 37.7749,
            "longitude": -122.4194,
            "name": "Downtown Gym",
            "address": "123 Market Street, San Francisco, CA 94103"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 7. Interactive Button Reply

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.BTN123456",
          "timestamp": "1702483200",
          "type": "interactive",
          "interactive": {
            "type": "button_reply",
            "button_reply": {
              "id": "book_class_yes",
              "title": "Yes, book me"
            }
          },
          "context": {
            "from": "123456789012345",
            "id": "wamid.ORIGINAL_MESSAGE_ID"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 8. Interactive List Reply

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.LIST123456",
          "timestamp": "1702483200",
          "type": "interactive",
          "interactive": {
            "type": "list_reply",
            "list_reply": {
              "id": "class_yoga",
              "title": "Yoga Class",
              "description": "Morning yoga session"
            }
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 9. Reply to Message (Context)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.REPLY123456",
          "timestamp": "1702483200",
          "type": "text",
          "text": {
            "body": "Yes, that works for me!"
          },
          "context": {
            "from": "123456789012345",
            "id": "wamid.ORIGINAL_MESSAGE_ID"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 10. Reaction to Message

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "messages": [{
          "from": "14155238886",
          "id": "wamid.REACT123456",
          "timestamp": "1702483200",
          "type": "reaction",
          "reaction": {
            "message_id": "wamid.ORIGINAL_MESSAGE_ID",
            "emoji": "👍"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

---

## Status Update Examples

### 1. Message Sent

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "statuses": [{
          "id": "wamid.STATUS123",
          "status": "sent",
          "timestamp": "1702483200",
          "recipient_id": "14155238886",
          "conversation": {
            "id": "conv123abc",
            "origin": {
              "type": "business_initiated"
            }
          },
          "pricing": {
            "billable": true,
            "pricing_model": "CBP",
            "category": "business_initiated"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 2. Message Delivered

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "statuses": [{
          "id": "wamid.STATUS123",
          "status": "delivered",
          "timestamp": "1702483210",
          "recipient_id": "14155238886"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 3. Message Read

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "statuses": [{
          "id": "wamid.STATUS123",
          "status": "read",
          "timestamp": "1702483220",
          "recipient_id": "14155238886"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 4. Message Failed

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "statuses": [{
          "id": "wamid.STATUS123",
          "status": "failed",
          "timestamp": "1702483200",
          "recipient_id": "14155238886",
          "errors": [{
            "code": 131047,
            "title": "Re-engagement message",
            "message": "Re-engagement message can only be sent after 24 hours",
            "error_data": {
              "details": "Cannot send template message after 24-hour window"
            }
          }]
        }]
      },
      "field": "messages"
    }]
  }]
}
```

---

## Error Examples

### 1. Invalid Phone Number

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "errors": [{
          "code": 131026,
          "title": "Message Undeliverable",
          "message": "Unable to deliver message. Reason: Invalid phone number"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 2. Rate Limit Exceeded

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+14155238886",
          "phone_number_id": "123456789012345"
        },
        "errors": [{
          "code": 131048,
          "title": "Too many messages",
          "message": "Message failed to send because there were too many messages sent from this phone number in a short period of time"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

---

## Testing Commands

### 1. Test Webhook Verification

```bash
# Replace YOUR_TOKEN with your actual verify token
curl -X GET "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=TEST123"

# Expected output: TEST123
```

### 2. Test Text Message (with signature)

```bash
#!/bin/bash

# Configuration
WEBHOOK_URL="http://localhost:3000/api/whatsapp/webhook"
APP_SECRET="your_app_secret_here"

# Payload
PAYLOAD='{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "123",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+1234567890",
          "phone_number_id": "123456789"
        },
        "messages": [{
          "from": "1234567890",
          "id": "wamid.test123",
          "timestamp": "1702483200",
          "type": "text",
          "text": {
            "body": "Test message"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" | sed 's/^.* //')

# Send request
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### 3. Test Status Update

```bash
#!/bin/bash

WEBHOOK_URL="http://localhost:3000/api/whatsapp/webhook"
APP_SECRET="your_app_secret_here"

PAYLOAD='{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "123",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+1234567890",
          "phone_number_id": "123456789"
        },
        "statuses": [{
          "id": "wamid.test123",
          "status": "delivered",
          "timestamp": "1702483200",
          "recipient_id": "1234567890"
        }]
      },
      "field": "messages"
    }]
  }]
}'

SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" | sed 's/^.* //')

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### 4. Send Test Message via WhatsApp API

```bash
#!/bin/bash

# Send a message that will trigger a webhook
PHONE_NUMBER_ID="your_phone_number_id"
ACCESS_TOKEN="your_access_token"
TO_NUMBER="1234567890"

curl -X POST "https://graph.facebook.com/v21.0/$PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "'"$TO_NUMBER"'",
    "type": "text",
    "text": {
      "body": "Test message from API"
    }
  }'
```

### 5. Test Invalid Signature (Should Fail)

```bash
#!/bin/bash

WEBHOOK_URL="http://localhost:3000/api/whatsapp/webhook"

PAYLOAD='{"test": "payload"}'

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=invalid_signature" \
  -d "$PAYLOAD"

# Expected: 401 Unauthorized
```

### 6. Monitor Webhook Logs

```sql
-- Check recent webhook events
SELECT 
  request_id,
  event_type,
  signature_valid,
  processed,
  processing_time_ms,
  created_at
FROM whatsapp_webhook_logs
ORDER BY created_at DESC
LIMIT 10;

-- Check failed webhooks
SELECT *
FROM whatsapp_webhook_logs
WHERE processed = false
ORDER BY created_at DESC;
```

---

## Common Error Codes

| Code | Title | Description |
|------|-------|-------------|
| 131026 | Message Undeliverable | Invalid phone number or user not on WhatsApp |
| 131047 | Re-engagement Required | 24-hour window expired |
| 131048 | Rate Limit Exceeded | Too many messages sent |
| 131051 | Unsupported Message Type | Message type not supported |
| 133000 | Generic User Error | Generic user-facing error |

---

**Last Updated:** July 4, 2026
