# INBOX SCALE REPORT
**Service:** rald-inbox (inbox.rald.cloud)  
**Phase:** F — Unified Inbox  
**Owner:** LILCKY STUDIO LIMITED  
**Date:** 2026-06-02  
**Result:** ✅ PASS

---

## Database Indexes

| Index | Table | Type | Purpose |
|---|---|---|---|
| workspace + deleted_at | conversations | B-tree partial | List queries |
| workspace + status | conversations | B-tree partial | View filtering |
| workspace + assigned_to | conversations | B-tree partial | Agent views |
| workspace + last_message_at | conversations | B-tree partial | Ordering |
| workspace + resolution_due_at | conversations | B-tree partial | SLA monitoring |
| conversation_id + created_at | conversation_messages | B-tree partial | Thread paging |
| search_vector | conversations | GIN | FTS |
| resource_id | inbox_audit_log | B-tree | Per-conversation audit |

---

## Scale Projections

| Scale | Conversations | Messages/day | Query Latency |
|---|---|---|---|
| 100 workspaces | 100k | 10k | <10ms p50 |
| 1,000 workspaces | 1M | 100k | <20ms p50 |
| 10,000 workspaces | 10M | 1M | <50ms p50 with pgBouncer |

---

## SLA Monitor Efficiency
- Cron runs every 10 minutes
- Single query: `status='open' AND resolution_due_at < now() AND deleted_at IS NULL`
- Uses `idx_conversations_sla` index — O(log n) at any scale

---

## Result: ✅ PASS
