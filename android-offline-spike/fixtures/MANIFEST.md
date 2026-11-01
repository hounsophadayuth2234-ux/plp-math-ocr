# PLP Math Offline Factory — Fixture Input Manifest (Phase 1B S5–S7)

This manifest specifies the DEV and HELD-OUT evaluation fixtures required for offline accuracy and deterministic gate evaluation on the OnePlus Pad 3.
Per Rule B7: **fixtures and golden answers belong strictly to the architect**. AGY will not author, edit, or select golden answers or tune on HELD-OUT sets.

---

## 1. Required Fixture Sets

| Gate / Step | Fixture Filename | Classification | Format | Required Content | Owner / Source |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **S5 (OCR)** | `khmer_ocr_dev.jsonl` | **DEV** | JSON Lines + PNG | Ground truth text, bounding boxes, diacritics, subscripts (Grade 1–6) | Curriculum Architect |
| **S5 (OCR)** | `khmer_ocr_heldout.jsonl` | **HELD-OUT** | JSON Lines + PNG | Unseen real textbook problems for zero-leakage evaluation | Curriculum Architect |
| **S5 (ICU4X)** | `khmer_segmentation_cases.json` | **DEV** | JSON Array | Sentence strings, expected ZWSP break indices, cluster boundaries | Khmer Linguist / Architect |
| **S6 (Mathcore)** | `mathcore_grade1_6_dev.json` | **DEV** | JSON Array | Typed `ProblemSpec` + exact `rust_decimal` answers (interest, loans, tax, currency, fractions) | Curriculum Architect |
| **S6 (Mathcore)** | `mathcore_grade1_6_heldout.json` | **HELD-OUT** | JSON Array | 50 unseen multi-step word problems with canonical solutions | Curriculum Architect |
| **S7 (Sync/WAL)** | `sync_concurrency_traces.json` | **DEV** | JSON Array | HLC timestamps, clock skew vectors (up to 7 days), concurrent conflict DAGs | Systems Architect |
| **S7 (Sync/WAL)** | `sync_heldout_reconciliation.json` | **HELD-OUT** | JSON Array | Complex multi-peer outbox ops for convergence validation | Systems Architect |

---

## 2. Integrity & Non-Weakening Invariants (Rule B9)

- Every fixture supplied must include an immutable SHA-256 in `checksums.sha256`.
- HELD-OUT fixtures are strictly read-only and must never be committed to training or tuning pipelines.
- Synthetic fixtures are quarantined in `fixtures/synthetic/` and are explicitly excluded from gate evaluations.

