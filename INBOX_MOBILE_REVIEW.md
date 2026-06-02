# INBOX MOBILE REVIEW
**Service:** rald-inbox (inbox.rald.cloud)  
**Phase:** F — Unified Inbox  
**Owner:** LILCKY STUDIO LIMITED  
**Date:** 2026-06-02  
**Result:** ✅ PASS

---

## Mobile-First Design Principles Applied

| Principle | Implementation |
|---|---|
| Minimal payload — list endpoint | Returns 20 conversations max by default |
| Minimal payload — message thread | Returns 50 messages max, paginated |
| No heavy joins by default | Participants/tags fetched on demand |
| Single-field sort | `last_message_at DESC` — simple index |
| Quick status update | `PATCH /api/conversations/:id` — 2-field max |
| Quick assign | `POST /api/conversations/:id/assign` — 1 field |
| Low-bandwidth search | Integrates with rald-search minimal GET variant |
| No WebSocket in Phase F | REST only — suitable for 3G |

---

## Payload Sizes

| Operation | Estimated Size |
|---|---|
| List 20 conversations | ~8KB |
| Single conversation detail | ~3KB |
| 50 messages in thread | ~15KB |
| Send message (request) | ~500B |
| Assign conversation | ~200B |
| Add tag | ~200B |

## Result: ✅ PASS
