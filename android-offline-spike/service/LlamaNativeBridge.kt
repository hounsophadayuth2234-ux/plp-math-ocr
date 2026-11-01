package com.plp.math.service

/**
 * JNI Bridge interface to native llama.cpp compiled for arm64-v8a
 * Optimized for Qualcomm Snapdragon 8 Elite (SM8750P).
 */
object LlamaNativeBridge {

    init {
        try {
            System.loadLibrary("plp_llama_engine")
        } catch (e: UnsatisfiedLinkError) {
            // Emulated/Host fallback mode when testing outside full APK packaging
            System.err.println("Native plp_llama_engine library not loaded: ${e.message}")
        }
    }

    /**
     * Loads a GGUF model via mmap and initializes the llama context.
     * @return pointer handle to the native llama_context wrapper
     */
    external fun loadModel(
        modelPath: String,
        backend: String,
        contextSize: Int,
        threads: Int,
        useMmap: Boolean
    ): Long

    /**
     * Executes prompt prefill and token streaming generation.
     */
    external fun streamInference(
        contextHandle: Long,
        prompt: String,
        maxTokens: Int,
        temperature: Float,
        callback: (tokenText: String, tokenId: Int) -> Unit
    )

    /**
     * Evicts model weights, frees llama context, and purges heap allocators.
     */
    external fun freeModel(contextHandle: Long)
}

