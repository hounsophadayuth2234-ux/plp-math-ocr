package com.plp.math.service

/**
 * JNI Bridge interface to native ONNX Runtime / QNN computer vision engine
 * compiled for arm64-v8a and optimized for Qualcomm Snapdragon 8 Elite (SM8750P).
 *
 * Backends:
 * - HTP_NPU: Qualcomm Hexagon Tensor Processor (HTP) v79 NPU via QNN Execution Provider
 * - Adreno_OpenCL: Qualcomm Adreno 830 GPU via OpenCL / DirectML
 * - Oryon_CPU: Qualcomm Oryon 6-core performance cluster with ARM NEON FP16/INT8 SIMD
 *
 * Supported Models:
 * - BiRefNet Full (General / HR) - 1024x1024 resolution commercial high-fidelity alpha matting
 * - RMBG-1.4 (Commercial) - 1024x1024 high-resolution subject isolation
 */
object OnnxCvNativeBridge {

    init {
        try {
            System.loadLibrary("plp_cv_engine")
        } catch (e: UnsatisfiedLinkError) {
            // Emulated/Host fallback mode when testing outside full APK packaging
            System.err.println("Native plp_cv_engine library not loaded: ${e.message}")
        }
    }

    /**
     * Initializes the ONNX Runtime session with Snapdragon 8 Elite QNN/HTP execution provider.
     * @param modelPath Absolute path to the ONNX model weights
     * @param backend "HTP_NPU", "Adreno_GPU", or "Oryon_CPU"
     * @param inputSize Target square resolution (e.g., 1024)
     * @param threads Number of Oryon performance threads (defaults to 4-6)
     * @return pointer handle to the native cv_session wrapper
     */
    external fun loadModel(
        modelPath: String,
        backend: String,
        inputSize: Int,
        threads: Int
    ): Long

    /**
     * Performs high-resolution neural background removal with raw NPU execution.
     * @param contextHandle Native session handle
     * @param inputRgba Raw RGBA byte array of the source image
     * @param width Source image width
     * @param height Source image height
     * @param refineEdges Whether to apply sub-pixel edge refinement & hair dehalo
     * @return Result object containing cutout RGBA, alpha mask, and execution timing
     */
    external fun removeBackground(
        contextHandle: Long,
        inputRgba: ByteArray,
        width: Int,
        height: Int,
        refineEdges: Boolean
    ): CvInferenceResult

    /**
     * Evicts CV model weights from NPU/RAM and frees native session handles.
     */
    external fun freeModel(contextHandle: Long)

    /**
     * Telemetry and execution metrics returned from native C++ inference.
     */
    data class CvInferenceResult(
        val outputRgba: ByteArray,
        val alphaMask: ByteArray,
        val outputWidth: Int,
        val outputHeight: Int,
        val preprocessMs: Long,
        val npuInferenceMs: Long,
        val postprocessMs: Long,
        val totalMs: Long,
        val backendUsed: String,
        val modelName: String
    )
}
