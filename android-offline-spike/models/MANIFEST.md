# PLP Math Offline Factory — Model Input Manifest (Phase 1B S2–S4)

This manifest defines the exact model contracts required for offline local inference on the OnePlus Pad 3 (Snapdragon 8 Elite / SM8750P).
Per Rule B7, **models belong to the architect**. AGY does not download, substitute, or invent model files.

---

## 1. Required Model Artifacts

| Module | Component | Exact Filename | Format | Expected Size | Target Runtime / Backend | License Requirement | Deployment Target |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M01** | OCR Text Detector | `m01_ocr_detector.onnx` | ONNX FP16 | 5 MB – 25 MB | ONNX Runtime (QNN HTP NPU / CPU) | Apache-2.0 / MIT | `models/` & push to `/data/local/tmp/models/` |
| **M01** | OCR Text Recognizer | `m01_ocr_recognizer.onnx` | ONNX FP16 | 15 MB – 50 MB | ONNX Runtime (QNN HTP NPU / CPU) | Apache-2.0 / MIT | `models/` & push to `/data/local/tmp/models/` |
| **M02** | Background Remover | `birefnet_lite_fp16.onnx` | ONNX FP16 | ~114.5 MB | ONNX Runtime (QNN HTP NPU / CPU) | MIT (onnx-community pinned) | `models/` & push to `/data/local/tmp/models/` |
| **M03** | HD Image Upscaler (4x) | `realesr-general-x4v3.onnx` | ONNX FP32/FP16 | 60 MB – 75 MB | ONNX Runtime (Tiled QNN / CPU) | BSD-3-Clause | `models/` & push to `/data/local/tmp/models/` |
| **M04** | Khmer Math Solver LLM | `m04_solver_q4_k_m.gguf` | GGUF (Q4_K_M) | 2.2 GB – 4.9 GB | llama.cpp (HTP NPU / OpenCL Adreno / CPU) | Apache-2.0 / Permissive | `models/` & push to `/data/local/tmp/models/` |
| **M05** | Visual Asset Studio | `m05_diffusion_distilled.onnx` | ONNX / GGUF | 1.0 GB – 2.5 GB | ONNX Runtime / llama.cpp (Batch Slot) | OpenRAIL / Apache-2.0 | `models/` & push to `/data/local/tmp/models/` |

---

## 2. Model Graph & Operator Constraints

- **Quantization Compatibility**:
  - GGUF weights must use standard llama.cpp Q4_K_M or Q4_0 block quantization.
  - ONNX models targeting Hexagon HTP via QNN Execution Provider must not use unsupported dynamic quantization operators (`DynamicQuantizeLinear` / `MatMulInteger`) unless fallback nodes are explicitly isolated.
- **Process Memory Limits**:
  - Resident Tier 1 pool (M01 + M02 + M03) must reside within 600 MB combined PSS.
  - Tier 2 single slot (M04 or M05) must reside within 4.5 GB PSS.
- **Verification Rule (B7)**:
  - Any model supplied must be accompanied by its exact SHA-256 and verified license card.
  - AGY will never substitute a lightweight placeholder model without explicit written instruction.

