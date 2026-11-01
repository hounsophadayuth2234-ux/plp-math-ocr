import sqlite3
import os
import sys
import time
import json
import uuid

# Ensure isolated python_libs (blake3) is available
sys.path.insert(0, os.path.abspath('android-offline-spike/python_libs'))
import blake3

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

class SqliteBlake3Store:
    def __init__(self, db_path="android-offline-spike/storage/plp_offline.db", blobs_dir="android-offline-spike/storage/blobs"):
        self.db_path = os.path.abspath(db_path)
        self.blobs_dir = os.path.abspath(blobs_dir)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        os.makedirs(self.blobs_dir, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self._init_schema()

    def _init_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA synchronous = FULL;")
        cursor.execute("PRAGMA foreign_keys = ON;")

        # 1. docs table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS docs (
            doc_id TEXT PRIMARY KEY,
            title_km TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            rev_id TEXT NOT NULL
        );
        """)

        # 2. blocks table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS blocks (
            block_id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            type TEXT NOT NULL,
            content_json TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
        );
        """)

        # 3. revisions_dag table (Immutable Content-Addressed DAG)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS revisions_dag (
            rev_id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            parent_rev_ids_json TEXT NOT NULL,
            canonical_content TEXT NOT NULL,
            author_id TEXT NOT NULL,
            hlc TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
        );
        """)

        # 4. ops_outbox table (Transactional Outbox)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ops_outbox (
            op_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            hlc TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            op_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            checksum TEXT NOT NULL,
            created_at TEXT NOT NULL,
            synced_at TEXT
        );
        """)

        # 5. blobs table (Content-addressed by BLAKE3)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS blobs (
            blob_hash TEXT PRIMARY KEY,
            mime_type TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            local_path TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """)

        # 6. model_manifests table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS model_manifests (
            model_id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            format TEXT NOT NULL,
            checksum TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        );
        """)

        # Indexes for fast DAG query and outbox drain
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocks_doc ON blocks(doc_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rev_dag_doc ON revisions_dag(doc_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ops_outbox_synced ON ops_outbox(synced_at);")
        self.conn.commit()

    def store_blob(self, data: bytes, mime_type: str = "application/octet-stream") -> str:
        blob_hash = blake3.blake3(data).hexdigest()
        blob_filename = f"{blob_hash}.bin"
        local_path = os.path.join(self.blobs_dir, blob_filename)

        if not os.path.exists(local_path):
            with open(local_path, "wb") as f:
                f.write(data)

        cursor = self.conn.cursor()
        cursor.execute("""
        INSERT OR IGNORE INTO blobs (blob_hash, mime_type, byte_size, local_path, created_at)
        VALUES (?, ?, ?, ?, datetime('now'));
        """, (blob_hash, mime_type, len(data), local_path))
        self.conn.commit()
        return blob_hash

    def create_document(self, title_km: str, author_id: str, device_id: str, hlc: str) -> tuple[str, str]:
        doc_id = str(uuid.uuid4())
        canonical_init = json.dumps({"title_km": title_km, "blocks": []}, sort_keys=True)
        # Root rev_id = blake3(canonical_content + '|root')
        rev_id = blake3.blake3((canonical_init + "|root").encode("utf-8")).hexdigest()
        
        cursor = self.conn.cursor()
        cursor.execute("BEGIN IMMEDIATE;")
        cursor.execute("""
        INSERT INTO docs (doc_id, title_km, created_at, updated_at, rev_id)
        VALUES (?, ?, datetime('now'), datetime('now'), ?);
        """, (doc_id, title_km, rev_id))
        
        cursor.execute("""
        INSERT INTO revisions_dag (rev_id, doc_id, parent_rev_ids_json, canonical_content, author_id, hlc, created_at)
        VALUES (?, ?, '[]', ?, ?, ?, datetime('now'));
        """, (rev_id, doc_id, canonical_init, author_id, hlc))

        op_id = str(uuid.uuid4())
        op_payload = json.dumps({"action": "CREATE_DOC", "doc_id": doc_id, "title_km": title_km, "rev_id": rev_id}, sort_keys=True)
        op_chk = blake3.blake3(op_payload.encode("utf-8")).hexdigest()

        cursor.execute("""
        INSERT INTO ops_outbox (op_id, device_id, hlc, schema_version, op_type, payload_json, checksum, created_at, synced_at)
        VALUES (?, ?, ?, 1, 'CREATE_DOC', ?, ?, datetime('now'), NULL);
        """, (op_id, device_id, hlc, op_payload, op_chk))

        self.conn.commit()
        return doc_id, rev_id

    def mutate_block_transactional(self, doc_id: str, block_id: str, block_type: str, content: dict,
                                   parent_rev_id: str, author_id: str, device_id: str, hlc: str) -> str:
        cursor = self.conn.cursor()
        cursor.execute("BEGIN IMMEDIATE;")

        content_json = json.dumps(content, ensure_ascii=False, sort_keys=True)
        status = content.get("status", "DRAFT")

        cursor.execute("""
        INSERT OR REPLACE INTO blocks (block_id, doc_id, type, content_json, status)
        VALUES (?, ?, ?, ?, ?);
        """, (block_id, doc_id, block_type, content_json, status))

        # Reconstruct canonical content of document to generate new revision node in DAG
        cursor.execute("SELECT block_id, type, content_json FROM blocks WHERE doc_id = ? ORDER BY block_id ASC;", (doc_id,))
        doc_blocks = [{"id": r[0], "type": r[1], "content": json.loads(r[2])} for r in cursor.fetchall()]
        canonical_doc = json.dumps({"doc_id": doc_id, "blocks": doc_blocks}, sort_keys=True, ensure_ascii=False)

        # Content-addressed revision ID: rev_id = blake3(canonical_doc + '|' + parent_rev_id)
        parent_revs = [parent_rev_id] if parent_rev_id else []
        parents_str = json.dumps(parent_revs, sort_keys=True)
        rev_id = blake3.blake3((canonical_doc + "|" + parents_str).encode("utf-8")).hexdigest()

        cursor.execute("""
        INSERT INTO revisions_dag (rev_id, doc_id, parent_rev_ids_json, canonical_content, author_id, hlc, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'));
        """, (rev_id, doc_id, parents_str, canonical_doc, author_id, hlc))

        cursor.execute("UPDATE docs SET rev_id = ?, updated_at = datetime('now') WHERE doc_id = ?;", (rev_id, doc_id))

        # Atomic Outbox Entry
        op_id = str(uuid.uuid4())
        op_payload = json.dumps({
            "action": "MUTATE_BLOCK",
            "doc_id": doc_id,
            "block_id": block_id,
            "rev_id": rev_id,
            "parent_rev_id": parent_rev_id,
            "content": content
        }, sort_keys=True, ensure_ascii=False)
        op_chk = blake3.blake3(op_payload.encode("utf-8")).hexdigest()

        cursor.execute("""
        INSERT INTO ops_outbox (op_id, device_id, hlc, schema_version, op_type, payload_json, checksum, created_at, synced_at)
        VALUES (?, ?, ?, 1, 'MUTATE_BLOCK', ?, ?, datetime('now'), NULL);
        """, (op_id, device_id, hlc, op_payload, op_chk))

        self.conn.commit()
        return rev_id

    def close(self):
        self.conn.close()

