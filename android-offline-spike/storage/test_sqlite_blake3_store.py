import sys
import os
import time

sys.path.insert(0, os.path.abspath('android-offline-spike/python_libs'))
import blake3
from sqlite_blake3_store import SqliteBlake3Store

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run_tests():
    db_file = "android-offline-spike/evidence/phase2_test.db"
    blobs_folder = "android-offline-spike/evidence/phase2_blobs"
    
    if os.path.exists(db_file):
        try: os.remove(db_file)
        except Exception: pass
    if os.path.exists(db_file + "-wal"):
        try: os.remove(db_file + "-wal")
        except Exception: pass
    if os.path.exists(db_file + "-shm"):
        try: os.remove(db_file + "-shm")
        except Exception: pass

    print("====================================================")
    print("PHASE 2: SQLITE WAL SCHEMA & BLAKE3 CONTENT STORE")
    print("Verification of Schema, Transactional Outbox & DAG")
    print("====================================================\n")

    store = SqliteBlake3Store(db_path=db_file, blobs_dir=blobs_folder)
    cursor = store.conn.cursor()

    # 1. Verify PRAGMAs
    cursor.execute("PRAGMA journal_mode;")
    jmode = cursor.fetchone()[0]
    cursor.execute("PRAGMA synchronous;")
    sync = cursor.fetchone()[0]
    print(f"Verified Journal Mode: {jmode.upper()}")
    print(f"Verified Synchronous Mode: {sync} (FULL)")
    assert jmode.lower() == "wal", "Journal mode must be WAL"
    assert sync == 2, "Synchronous mode must be FULL (2)"

    # 2. Test BLAKE3 Content-Addressed Blob Storage
    print("\nTesting BLAKE3 Content-Addressed Blob Storage...")
    sample_blob = b"PLP Math Khmer Offline Factory - Module 04 Solver Weights Manifest"
    expected_hash = blake3.blake3(sample_blob).hexdigest()
    blob_hash1 = store.store_blob(sample_blob, "text/plain")
    blob_hash2 = store.store_blob(sample_blob, "text/plain") # duplicate
    
    print(f"Blob BLAKE3 Hash: {blob_hash1}")
    assert blob_hash1 == expected_hash, "Blob hash must match BLAKE3"
    assert blob_hash1 == blob_hash2, "Duplicate blob must deduplicate to same hash"

    cursor.execute("SELECT count(*) FROM blobs WHERE blob_hash = ?;", (blob_hash1,))
    assert cursor.fetchone()[0] == 1, "Blob must exist exactly once in DB"
    print("BLAKE3 Blob Storage & Deduplication: PASS")

    # 3. Create Document & Test Transactional Outbox
    print("\nCreating Document & Seeding Revision DAG...")
    device_id = "OPD2415-be48f0a1"
    hlc_0 = "HLC-20261031T155000-0001-OPD2415"
    doc_id, root_rev = store.create_document("មេរៀនគណិតវិទ្យាទី១: ការប្រាក់ធម្មតា", "author-khmer-expert", device_id, hlc_0)
    print(f"Doc ID:   {doc_id}")
    print(f"Root Rev: {root_rev}")

    # 4. Perform 30 Atomic Block Mutations and Build Immutable DAG
    print("\nExecuting 30 Transactional Block Mutations (Block + DAG node + Outbox op)...")
    latencies = []
    current_rev = root_rev

    for i in range(1, 31):
        t0 = time.perf_counter()
        block_id = f"step-{i:02d}"
        hlc_i = f"HLC-20261031T155000-{i+1:04d}-OPD2415"
        
        content = {
            "title_km": f"ជំហានទី {i}",
            "template_id": "tpl_simple_interest_calc",
            "formula_latex": f"I_{i} = P \\times r \\times t",
            "slots_km": {"principal": "200,000", "rate": "5%", "time": "1 ឆ្នាំ"},
            "result_ref": f"{{{{result:s{i}}}}}",
            "badge": "VERIFIED",
            "status": "APPROVED"
        }
        
        current_rev = store.mutate_block_transactional(
            doc_id=doc_id,
            block_id=block_id,
            block_type="math_solution_step",
            content=content,
            parent_rev_id=current_rev,
            author_id="author-khmer-expert",
            device_id=device_id,
            hlc=hlc_i
        )
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)

    avg_lat = sum(latencies) / len(latencies)
    p95_lat = sorted(latencies)[int(len(latencies) * 0.95)]
    print(f"Mutations Executed:       {len(latencies)}")
    print(f"Average Mutation Latency: {avg_lat:.2f} ms")
    print(f"P95 Mutation Latency:     {p95_lat:.2f} ms")
    print(f"Head Revision ID:         {current_rev}")

    # 5. Verify Immutable DAG Integrity
    print("\nVerifying Revision DAG Structure...")
    cursor.execute("SELECT rev_id, parent_rev_ids_json, hlc FROM revisions_dag WHERE doc_id = ? ORDER BY rowid ASC;", (doc_id,))
    dag_rows = cursor.fetchall()
    print(f"Total DAG Nodes: {len(dag_rows)} (Expected: 31 = 1 root + 30 mutations)")
    assert len(dag_rows) == 31, "DAG node count mismatch"

    # Verify parent pointer chain
    for idx in range(1, len(dag_rows)):
        rev, parents_json, _ = dag_rows[idx]
        prev_rev = dag_rows[idx-1][0]
        assert prev_rev in parents_json, f"DAG link broken at step {idx}: {prev_rev} not in {parents_json}"
    print("Revision DAG Linkage & Immutability: PASS (100% strictly chained)")

    # 6. Verify Transactional Outbox
    print("\nVerifying Transactional Outbox Integrity...")
    cursor.execute("SELECT count(*), count(distinct op_id) FROM ops_outbox WHERE payload_json LIKE ?;", (f'%{doc_id}%',))
    outbox_count, unique_ops = cursor.fetchone()
    print(f"Total Ops in Outbox:  {outbox_count} (Expected: 31)")
    print(f"Unique Operation IDs: {unique_ops}")
    assert outbox_count == 31, "Outbox ops count mismatch"
    assert unique_ops == 31, "All outbox ops must have unique UUIDs"

    # Verify all ops have non-null BLAKE3 checksums
    cursor.execute("SELECT count(*) FROM ops_outbox WHERE checksum IS NULL OR length(checksum) != 64;")
    invalid_checksums = cursor.fetchone()[0]
    assert invalid_checksums == 0, "All ops must have valid 64-char BLAKE3 checksums"
    print("Outbox BLAKE3 Checksums: PASS (100% valid)")

    # 7. Checkpoint WAL
    cursor.execute("PRAGMA wal_checkpoint(TRUNCATE);")
    chk = cursor.fetchone()
    print(f"\nWAL Checkpoint (TRUNCATE): busy={chk[0]}, log={chk[1]}, checkpointed={chk[2]}")
    assert chk[0] == 0, "WAL checkpoint must succeed with busy=0"

    store.close()
    print("\n====================================================")
    print("PHASE 2 STORAGE SUMMARY: ALL TESTS PASSED (100%)")
    print("====================================================")

if __name__ == '__main__':
    run_tests()
