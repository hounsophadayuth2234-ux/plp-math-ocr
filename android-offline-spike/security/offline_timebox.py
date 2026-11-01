import os
import sys
import time
import json
import sqlite3
import hmac
import hashlib

sys.path.insert(0, os.path.abspath('android-offline-spike/python_libs'))
import blake3

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SERVER_SIGNING_KEY = b"plp_math_cambodia_master_server_secret_key_2026"

class OfflineToken:
    @staticmethod
    def mint_token(user_id: str, role: str, device_id: str, issued_at: int, ttl_seconds: int = 604800) -> str:
        payload = {
            "user_id": user_id,
            "role": role,
            "device_id": device_id,
            "issued_at": issued_at,
            "expires_at": issued_at + ttl_seconds,
            "max_offline_seconds": ttl_seconds,
            "nonce": os.urandom(16).hex()
        }
        payload_bytes = json.dumps(payload, sort_keys=True).encode('utf-8')
        signature = hmac.new(SERVER_SIGNING_KEY, payload_bytes, hashlib.sha256).hexdigest()
        token_envelope = {
            "payload": payload,
            "signature": signature
        }
        return json.dumps(token_envelope)

    @staticmethod
    def verify_signature(token_str: str) -> dict:
        try:
            token_envelope = json.loads(token_str)
            payload = token_envelope["payload"]
            sig = token_envelope["signature"]
            payload_bytes = json.dumps(payload, sort_keys=True).encode('utf-8')
            expected_sig = hmac.new(SERVER_SIGNING_KEY, payload_bytes, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected_sig):
                raise ValueError("INVALID_SIGNATURE")
            return payload
        except Exception as e:
            raise ValueError(f"TOKEN_VERIFICATION_FAILED: {str(e)}")


class OfflineTimeboxValidator:
    def __init__(self, db_path="android-offline-spike/evidence/timebox_anchor.db"):
        self.db_path = os.path.abspath(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS monotonic_timebox_anchor (
            anchor_id INTEGER PRIMARY KEY,
            last_known_wall_clock INTEGER NOT NULL,
            monotonic_uptime_accumulator INTEGER NOT NULL,
            last_boot_session_id TEXT NOT NULL,
            last_updated_at TEXT NOT NULL
        );
        """)
        self.conn.commit()

    def get_or_create_anchor(self, current_wall_clock: int, boot_session_id: str) -> tuple[int, int]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT last_known_wall_clock, monotonic_uptime_accumulator FROM monotonic_timebox_anchor WHERE anchor_id = 1;")
        row = cursor.fetchone()
        if row is None:
            cursor.execute("""
            INSERT INTO monotonic_timebox_anchor (anchor_id, last_known_wall_clock, monotonic_uptime_accumulator, last_boot_session_id, last_updated_at)
            VALUES (1, ?, 0, ?, datetime('now'));
            """, (current_wall_clock, boot_session_id))
            self.conn.commit()
            return current_wall_clock, 0
        return row[0], row[1]

    def update_anchor(self, current_wall_clock: int, uptime_delta: int, boot_session_id: str):
        cursor = self.conn.cursor()
        cursor.execute("""
        UPDATE monotonic_timebox_anchor
        SET last_known_wall_clock = MAX(last_known_wall_clock, ?),
            monotonic_uptime_accumulator = monotonic_uptime_accumulator + ?,
            last_boot_session_id = ?,
            last_updated_at = datetime('now')
        WHERE anchor_id = 1;
        """, (current_wall_clock, max(0, uptime_delta), boot_session_id))
        self.conn.commit()

    def validate_session(self, token_str: str, current_wall_clock: int, elapsed_realtime: int, boot_session_id: str) -> dict:
        # 1. Verify Cryptographic Signature
        payload = OfflineToken.verify_signature(token_str)
        
        # 2. Check Monotonic Anchor & Clock Rollback
        last_known_wall, uptime_acc = self.get_or_create_anchor(current_wall_clock, boot_session_id)
        
        # Clock rollback tolerance: 60 seconds
        if current_wall_clock < last_known_wall - 60:
            return {
                "allowed": False,
                "reason": "CLOCK_ROLLBACK_DETECTED",
                "details": f"Current clock ({current_wall_clock}) is earlier than persisted anchor ({last_known_wall})"
            }

        # 3. Check Pre-Issuance Tamper (Clock before token issuance)
        if current_wall_clock < payload["issued_at"] - 60:
            return {
                "allowed": False,
                "reason": "PRE_ISSUANCE_CLOCK_TAMPER",
                "details": f"Current clock ({current_wall_clock}) is before token issuance ({payload['issued_at']})"
            }

        # 4. Check Expiration
        if current_wall_clock > payload["expires_at"]:
            return {
                "allowed": False,
                "reason": "TOKEN_EXPIRED",
                "details": f"Current clock ({current_wall_clock}) exceeds expires_at ({payload['expires_at']})"
            }

        # 5. Check Monotonic Uptime Accumulator
        if uptime_acc > payload["max_offline_seconds"]:
            return {
                "allowed": False,
                "reason": "MAX_OFFLINE_DURATION_EXCEEDED",
                "details": f"Monotonic uptime accumulator ({uptime_acc}s) exceeds max offline limit ({payload['max_offline_seconds']}s)"
            }

        # Update anchor monotonically forward
        self.update_anchor(current_wall_clock, 1, boot_session_id)

        return {
            "allowed": True,
            "user_id": payload["user_id"],
            "role": payload["role"],
            "remaining_seconds": payload["expires_at"] - current_wall_clock,
            "residual_risk_note": "A disabled account stays usable offline until next sync."
        }

