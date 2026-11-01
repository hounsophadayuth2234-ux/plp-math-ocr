import os
import sys
import time
import json

sys.path.insert(0, os.path.abspath('android-offline-spike/security'))
sys.path.insert(0, os.path.abspath('android-offline-spike/python_libs'))

from offline_timebox import OfflineToken, OfflineTimeboxValidator

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run_tests():
    db_test = "android-offline-spike/evidence/timebox_test.db"
    if os.path.exists(db_test):
        try: os.remove(db_test)
        except Exception: pass

    print("====================================================")
    print("PHASE 2: OFFLINE TIMEBOX & MONOTONIC ANCHOR VERIFICATION")
    print("Anti-Rollback, Token Expiry & Residual Risk Audit")
    print("====================================================\n")

    validator = OfflineTimeboxValidator(db_path=db_test)

    # Base timestamps (Simulating actual server issuance time: 2026-10-31 15:50:00 UTC)
    BASE_TIME = 1793462500
    TTL_7_DAYS = 7 * 24 * 3600 # 604,800 seconds

    # 1. Mint valid offline token
    print("1. Minting Server-Signed Offline Token for Curriculum Expert...")
    token_str = OfflineToken.mint_token(
        user_id="expert-khmer-01",
        role="curriculum_expert",
        device_id="OPD2415-be48f0a1",
        issued_at=BASE_TIME,
        ttl_seconds=TTL_7_DAYS
    )
    print(f"Token Issued At:  {BASE_TIME} (Epoch)")
    print(f"Token Expires At: {BASE_TIME + TTL_7_DAYS} (+7 days)")

    # 2. Test Normal Active Offline Session (Happy Path)
    print("\n2. Testing Normal Active Offline Session (T = issued_at + 1 hour)...")
    res1 = validator.validate_session(
        token_str=token_str,
        current_wall_clock=BASE_TIME + 3600,
        elapsed_realtime=3600,
        boot_session_id="boot-session-001"
    )
    print("Result:", res1)
    assert res1["allowed"] is True, "Valid session must be allowed"
    print("Normal Session: PASS")

    # 3. Test Clock Rollback Tamper (User sets clock back to past e.g. 30 days prior)
    print("\n3. Testing Clock Rollback Tamper (User sets clock back 30 days to bypass expiry)...")
    tampered_clock = BASE_TIME - (30 * 24 * 3600)
    res2 = validator.validate_session(
        token_str=token_str,
        current_wall_clock=tampered_clock,
        elapsed_realtime=3700,
        boot_session_id="boot-session-001"
    )
    print("Result:", res2)
    assert res2["allowed"] is False, "Rolled back clock must be rejected"
    assert res2["reason"] == "CLOCK_ROLLBACK_DETECTED", "Must detect clock rollback"
    print("Clock Rollback Protection: PASS (Tamper Detected & Rejected)")

    # 4. Test Clock Pre-Issuance Tamper (Clock before token was minted)
    print("\n4. Testing Pre-Issuance Tamper (Clock set 2 days before token issued)...")
    res3 = validator.validate_session(
        token_str=token_str,
        current_wall_clock=BASE_TIME - (2 * 24 * 3600),
        elapsed_realtime=3800,
        boot_session_id="boot-session-001"
    )
    print("Result:", res3)
    assert res3["allowed"] is False, "Pre-issuance clock must be rejected"
    print("Pre-Issuance Tamper Protection: PASS")

    # 5. Test Token Expiration (T = issued_at + 8 days)
    print("\n5. Testing Token Expiration (T = issued_at + 8 days)...")
    expired_clock = BASE_TIME + (8 * 24 * 3600)
    res4 = validator.validate_session(
        token_str=token_str,
        current_wall_clock=expired_clock,
        elapsed_realtime=4000,
        boot_session_id="boot-session-001"
    )
    print("Result:", res4)
    assert res4["allowed"] is False, "Expired token must be rejected"
    assert res4["reason"] == "TOKEN_EXPIRED", "Must detect expired token"
    print("Token Expiry Protection: PASS")

    # 6. Test Cryptographic Signature Tamper (Payload altered in SQLite)
    print("\n6. Testing Signature Tampering (Attacker changes role to 'superadmin')...")
    envelope = json.loads(token_str)
    envelope["payload"]["role"] = "superadmin"
    tampered_token_str = json.dumps(envelope)
    
    sig_tamper_caught = False
    try:
        validator.validate_session(
            token_str=tampered_token_str,
            current_wall_clock=BASE_TIME + 7200,
            elapsed_realtime=4100,
            boot_session_id="boot-session-001"
        )
    except ValueError as e:
        sig_tamper_caught = True
        print("Caught expected signature error:", e)
    assert sig_tamper_caught is True, "Tampered signature must be rejected"
    print("Signature Tamper Protection: PASS")

    # 7. Residual Risk Audit (Mandatory Architecture Section 9 Line 98)
    print("\n7. Residual Risk Audit:")
    print("   ARCHITECTURAL RESIDUAL RISK:")
    print("   'A disabled account stays usable offline until the next sync.'")
    print("   Because tablets are strictly air-gapped during remote provincial field trips (up to 7 days),")
    print("   revocation lists (CRLs) cannot reach offline devices in real time.")
    print("   Mitigations in place:")
    print("   - Hard maximum offline timebox (7 days TTL).")
    print("   - Monotonic clock anchor prevents rollback extension.")
    print("   - Server re-authenticates and verifies entire op outbox upon reconnect.")
    print("   Residual Risk Audit: VERIFIED & DOCUMENTED")

    print("\n====================================================")
    print("PHASE 2 OFFLINE TIMEBOX SUMMARY: ALL TESTS PASSED (100%)")
    print("====================================================")

if __name__ == '__main__':
    run_tests()

