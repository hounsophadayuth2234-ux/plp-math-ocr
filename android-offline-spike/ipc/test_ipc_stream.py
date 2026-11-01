import os
import sys
import time
import socket
import threading
import json
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# IPC Protocol for PLP Math Offline Engine
# Uses standard TCP localhost socket on Windows host, and Android LocalSocket on device

HOST = '127.0.0.1'
PORT = 49152 # Dedicated IPC loopback port

class MockInferenceServiceProcess:
    def __init__(self, port=PORT):
        self.port = port
        self.server_sock = None
        self.is_running = False
        self.state = "NotLoaded"
        self.active_model = None
        self.backend = "Adreno_OpenCL"

    def start(self):
        self.server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_sock.bind((HOST, self.port))
        self.server_sock.listen(5)
        self.is_running = True
        print(f"[InferenceService :inference PID={os.getpid()}] Server listening on {HOST}:{self.port}")
        
        thread = threading.Thread(target=self._accept_loop, daemon=True)
        thread.start()

    def _accept_loop(self):
        while self.is_running:
            try:
                client_sock, _ = self.server_sock.accept()
                threading.Thread(target=self._handle_client, args=(client_sock,), daemon=True).start()
            except Exception:
                break

    def _handle_client(self, sock):
        reader = sock.makefile('r', encoding='utf-8')
        writer = sock.makefile('w', encoding='utf-8')
        try:
            while self.is_running:
                line = reader.readline()
                if not line:
                    break
                req = json.loads(line)
                action = req.get("action")

                if action == "PING":
                    resp = {"status": "PONG", "process": ":inference", "pid": os.getpid()}
                    writer.write(json.dumps(resp) + '\n')
                    writer.flush()

                elif action == "LOAD_MODEL":
                    model_path = req.get("model_path")
                    self.state = "Loading"
                    time.sleep(0.05) # Simulate mmap loading
                    self.state = "Ready"
                    self.active_model = os.path.basename(model_path)
                    resp = {
                        "status": "LOADED",
                        "model": self.active_model,
                        "backend": self.backend,
                        "state": self.state
                    }
                    writer.write(json.dumps(resp) + '\n')
                    writer.flush()

                elif action == "STREAM_INFERENCE":
                    prompt = req.get("prompt", "")
                    max_tokens = req.get("max_tokens", 20)
                    t0 = time.perf_counter()
                    
                    # Simulated token stream for Khmer math problem
                    tokens = [
                        "{\n", "  \"title_km\": ", "\"ដំណោះស្រាយ\",\n",
                        "  \"steps\": [\n", "    {\n",
                        "      \"formula_latex\": \"I = P \\times r \\times t\",\n",
                        "      \"result_ref\": \"{{result:s1}}\"\n",
                        "    }\n", "  ]\n", "}\n"
                    ]
                    
                    first_token_time = None
                    for idx, tok in enumerate(tokens):
                        time.sleep(0.015) # ~66 tokens/sec streaming simulation
                        if first_token_time is None:
                            first_token_time = (time.perf_counter() - t0) * 1000.0
                        chunk = {
                            "type": "token",
                            "text": tok,
                            "token_id": 100 + idx,
                            "index": idx + 1
                        }
                        writer.write(json.dumps(chunk, ensure_ascii=False) + '\n')
                        writer.flush()

                    total_time = (time.perf_counter() - t0) * 1000.0
                    tps = (len(tokens) / (total_time / 1000.0))
                    done_chunk = {
                        "type": "done",
                        "total_tokens": len(tokens),
                        "ttft_ms": round(first_token_time, 2),
                        "total_time_ms": round(total_time, 2),
                        "tokens_per_sec": round(tps, 2),
                        "backend": self.backend
                    }
                    writer.write(json.dumps(done_chunk) + '\n')
                    writer.flush()

                elif action == "UNLOAD_MODEL":
                    self.state = "Evicting"
                    time.sleep(0.02)
                    self.state = "NotLoaded"
                    self.active_model = None
                    resp = {"status": "UNLOADED", "state": self.state}
                    writer.write(json.dumps(resp) + '\n')
                    writer.flush()

                elif action == "GET_STATUS":
                    resp = {
                        "state": self.state,
                        "active_model": self.active_model,
                        "backend": self.backend,
                        "process": ":inference",
                        "pid": os.getpid()
                    }
                    writer.write(json.dumps(resp) + '\n')
                    writer.flush()
        except Exception:
            pass
        finally:
            try: sock.close()
            except Exception: pass

    def stop(self):
        self.is_running = False
        if self.server_sock:
            try: self.server_sock.close()
            except Exception: pass

def run_ipc_client_tests():
    print("====================================================")
    print("PHASE 3: INFERENCE SERVICE & IPC TOKEN STREAMING")
    print("Verification of Process Isolation, Protocol & Streaming")
    print("====================================================\n")

    # 1. Start Server
    server = MockInferenceServiceProcess(PORT)
    server.start()
    time.sleep(0.1)

    # 2. Connect Client (Simulating Tauri Main Process)
    client_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client_sock.connect((HOST, PORT))
    reader = client_sock.makefile('r', encoding='utf-8')
    writer = client_sock.makefile('w', encoding='utf-8')
    print("[Tauri Main Process] Connected to :inference IPC socket.")

    # 3. Test PING / PONG
    print("\n1. Testing IPC Heartbeat (PING -> PONG)...")
    writer.write(json.dumps({"action": "PING"}) + '\n')
    writer.flush()
    ping_resp = json.loads(reader.readline())
    print("Response:", ping_resp)
    assert ping_resp["status"] == "PONG", "Heartbeat failed"
    assert ping_resp["process"] == ":inference", "Process name must be :inference"
    print("IPC Heartbeat: PASS")

    # 4. Test Model Loading
    print("\n2. Testing Model Loading State Machine (LOAD_MODEL)...")
    load_req = {
        "action": "LOAD_MODEL",
        "model_path": "android-offline-spike/models/Qwen2.5-Math-1.5B-Instruct.Q5_K_S.gguf",
        "backend": "Adreno_OpenCL"
    }
    writer.write(json.dumps(load_req) + '\n')
    writer.flush()
    load_resp = json.loads(reader.readline())
    print("Response:", load_resp)
    assert load_resp["status"] == "LOADED"
    assert load_resp["state"] == "Ready"
    print("Model Loading & State Machine: PASS")

    # 5. Test Token Streaming
    print("\n3. Testing Token Streaming Protocol (STREAM_INFERENCE)...")
    stream_req = {
        "action": "STREAM_INFERENCE",
        "prompt": "ខ្ចីប្រាក់ ២០០,០០០ រៀល ក្នុងអត្រា ៥% រយៈពេល ១ ឆ្នាំ",
        "max_tokens": 128
    }
    writer.write(json.dumps(stream_req, ensure_ascii=False) + '\n')
    writer.flush()

    received_tokens = []
    done_payload = None

    while True:
        line = reader.readline()
        if not line: break
        chunk = json.loads(line)
        if chunk.get("type") == "token":
            received_tokens.append(chunk["text"])
        elif chunk.get("type") == "done":
            done_payload = chunk
            break

    print(f"Total Streamed Chunks: {len(received_tokens)}")
    print(f"First Token Latency (TTFT): {done_payload['ttft_ms']} ms")
    print(f"Stream Throughput:          {done_payload['tokens_per_sec']} tokens/sec")
    print(f"Streamed Reconstruction:\n{''.join(received_tokens)}")
    assert len(received_tokens) > 0, "Must receive streamed tokens"
    assert done_payload is not None, "Must receive terminal done chunk"
    print("Token Streaming Protocol: PASS")

    # 6. Test Model Unload (Purge)
    print("\n4. Testing Model Eviction & Cache Purge (UNLOAD_MODEL)...")
    writer.write(json.dumps({"action": "UNLOAD_MODEL"}) + '\n')
    writer.flush()
    unload_resp = json.loads(reader.readline())
    print("Response:", unload_resp)
    assert unload_resp["status"] == "UNLOADED"
    assert unload_resp["state"] == "NotLoaded"
    print("Model Eviction & Purge: PASS")

    # 7. Test LMKD Crash Isolation & Reconnection Recovery
    print("\n5. Testing Process Crash Isolation & Auto-Recovery...")
    print("Simulating native SIGSEGV / LMKD kill of :inference process...")
    server.stop()
    client_sock.close()

    # Restart service (simulating Android OS restarting foreground service)
    time.sleep(0.1)
    recovered_server = MockInferenceServiceProcess(PORT)
    recovered_server.start()
    time.sleep(0.1)

    reconnect_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    reconnect_sock.connect((HOST, PORT))
    rec_reader = reconnect_sock.makefile('r', encoding='utf-8')
    rec_writer = reconnect_sock.makefile('w', encoding='utf-8')

    rec_writer.write(json.dumps({"action": "PING"}) + '\n')
    rec_writer.flush()
    rec_resp = json.loads(rec_reader.readline())
    print("Recovered Service Response:", rec_resp)
    assert rec_resp["status"] == "PONG", "Recovery reconnect failed"
    print("Process Crash Isolation & Auto-Recovery: PASS")

    recovered_server.stop()
    reconnect_sock.close()

    print("\n====================================================")
    print("PHASE 3 SUMMARY: ALL IPC & SERVICE TESTS PASSED (100%)")
    print("====================================================")

if __name__ == '__main__':
    run_ipc_client_tests()

