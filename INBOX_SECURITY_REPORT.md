# INBOX SECURITY REPORT
**Service:** rald-inbox (inbox.rald.cloud)  
**Phase:** F — Unified Inbox  
**Owner:** LILCKY STUDIO LIMITED  
**Date:** 2026-06-02  
**Result:** ✅ PASS — 0 CRITICAL · 0 HIGH · 2 MEDIUM · 2 LOW

---

## Security Controls

| Control | Implementation | Status |
|---|---|---|
| JWT auth | `authMiddleware` — same RALD JWT pattern | ✅ |
| Workspace isolation | `workspaceMiddleware` + `workspace_id` on all tables | ✅ |
| RBAC | `adminMiddleware` on audit route | ✅ |
| Rate limiting | Cloudflare KV (same as other services) | ✅ |
| Conversation isolation | `workspace_id` filter on every query | ✅ |
| Message isolation | `workspace_id` filter + conversation FK | ✅ |
| Soft delete | `deleted_at` on conversations + messages | ✅ |
| Audit trail | 22 action types on all mutations | ✅ |
| CORS | Whitelist-only origins | ✅ |
| Input validation | Type guards on all POST bodies | ✅ |

---

## Tenant Isolation Tests

| Test | Result |
|---|---|
| Conversation from Workspace A not visible from Workspace B | BLOCKED |
| Messages filtered by workspace_id | BLOCKED |
| Saved views filtered by workspace_id + owner | BLOCKED |
| Audit log filtered by workspace_id | BLOCKED |
| SLA data filtered by workspace_id | BLOCKED |

---

## MEDIUM Findings

### M1 — No conversation-level participant access control
Conversations are accessible to any workspace member. No per-conversation permission model.  
**Phase G mitigation:** Add `conversation_participants` enforcement.

### M2 — Message content not encrypted at rest
Conversation messages stored as plaintext in Supabase.  
**Mitigation:** Supabase encrypts at rest (AES-256). Application-level encryption is Phase G+.

---

## LOW Findings

1. **File attachment validation** — Attachment size/type validation not implemented (no attachments in Phase F)
2. **Mentioned user IDs** — Mentions not validated against workspace membership

---

## Result: ✅ PASS — 0 CRITICAL · 0 HIGH
