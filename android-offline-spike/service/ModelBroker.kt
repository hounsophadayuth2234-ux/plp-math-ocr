package com.plp.math.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.io.File

/**
 * ModelBroker - Single Slot Tier 2 Engine Lifecycle Manager (Phase 3)
 *
 * Implements finite state machine:
 * [NotLoaded] -> [Loading] -> [Ready] -> [Running] -> [CoolingDown] -> [Evicting]
 *
 * Rules:
 * 1. Exactly ONE Tier 2 model (LLM or Diffusion) active in RAM at any time.
 * 2. Unload before load (with native allocator cache purge).
 * 3. Memory-map weights with mmap; never read whole file into heap.
 */
class ModelBroker(private val context: Context) {

    companion object {
        private const val TAG = "PLPMath:ModelBroker"
    }

    enum class State {
        NotLoaded,
        Loading,
        Ready,
        Running,
        CoolingDown,
        Evicting,
        Failed
    }

    private val mutex = Mutex()
    private var currentState = State.NotLoaded
    private var activeModelPath: String? = null
    private var activeBackend: String = "CPU"
    private var nativeContextHandle: Long = 0L

    // Native Computer Vision (Module 02) Context
    private var nativeCvContextHandle: Long = 0L
    private var activeCvModelPath: String? = null
    private var activeCvBackend: String = "HTP_NPU"

    fun getStatus(): JSONObject {
        return JSONObject().apply {
            put("state", currentState.name)
            put("active_model", activeModelPath ?: JSONObject.NULL)
            put("active_backend", activeBackend)
            put("is_loaded", currentState == State.Ready || currentState == State.Running)
            put("active_cv_model", activeCvModelPath ?: JSONObject.NULL)
            put("active_cv_backend", activeCvBackend)
            put("is_cv_loaded", nativeCvContextHandle != 0L)
        }
    }

    suspend fun loadModel(modelPath: String, backendPreference: String = "AUTO"): JSONObject = mutex.withLock {
        Log.i(TAG, "Requested loadModel: $modelPath (Backend: $backendPreference)")

        if (currentState == State.Ready && activeModelPath == modelPath) {
            return JSONObject().apply {
                put("status", "ALREADY_LOADED")
                put("model", modelPath)
                put("backend", activeBackend)
            }
        }

        // 1. Evict existing model if any
        if (currentState != State.NotLoaded) {
            evictInternal()
        }

        currentState = State.Loading
        val file = File(modelPath)
        if (!file.exists()) {
            currentState = State.Failed
            return JSONObject().apply {
                put("status", "ERROR")
                put("message", "Model file does not exist: $modelPath")
            }
        }

        try {
            // Determine optimal Snapdragon 8 Elite backend
            val chosenBackend = when (backendPreference.uppercase()) {
                "HTP", "NPU" -> "HTP_NPU"
                "OPENCL", "GPU" -> "Adreno_OpenCL"
                "VULKAN" -> "Adreno_Vulkan"
                "CPU" -> "Oryon_CPU"
                else -> {
                    // Qualcomm Snapdragon 8 Elite defaults to Adreno OpenCL or Oryon CPU
                    if (file.length() > 3L * 1024 * 1024 * 1024) "Adreno_OpenCL" else "Oryon_CPU"
                }
            }

            // Call native JNI bridge to initialize llama.cpp with mmap
            nativeContextHandle = LlamaNativeBridge.loadModel(
                modelPath = file.absolutePath,
                backend = chosenBackend,
                contextSize = 2048,
                threads = 6, // 6 performance cores on Snapdragon 8 Elite
                useMmap = true
            )

            activeModelPath = file.absolutePath
            activeBackend = chosenBackend
            currentState = State.Ready

            Log.i(TAG, "Model successfully loaded via $chosenBackend (Handle: $nativeContextHandle)")

            return JSONObject().apply {
                put("status", "LOADED")
                put("model", file.name)
                put("backend", chosenBackend)
                put("size_bytes", file.length())
            }
        } catch (e: Exception) {
            currentState = State.Failed
            Log.e(TAG, "Failed to load model", e)
            return JSONObject().apply {
                put("status", "ERROR")
                put("message", e.message)
            }
        }
    }

    suspend fun streamInference(
        prompt: String,
        maxTokens: Int,
        temperature: Float,
        onChunk: (JSONObject) -> Unit
    ) = mutex.withLock {
        if (currentState != State.Ready) {
            val err = JSONObject().apply {
                put("type", "error")
                put("message", "Model not ready (Current state: ${currentState.name})")
            }
            onChunk(err)
            return@withLock
        }

        currentState = State.Running
        val t0 = System.currentTimeMillis()
        var tokenCount = 0
        var firstTokenTime = 0L

        try {
            LlamaNativeBridge.streamInference(
                contextHandle = nativeContextHandle,
                prompt = prompt,
                maxTokens = maxTokens,
                temperature = temperature
            ) { tokenText, tokenId ->
                tokenCount++
                if (tokenCount == 1) {
                    firstTokenTime = System.currentTimeMillis() - t0
                }

                val chunk = JSONObject().apply {
                    put("type", "token")
                    put("text", tokenText)
                    put("token_id", tokenId)
                    put("token_index", tokenCount)
                }
                onChunk(chunk)
            }

            val totalTime = System.currentTimeMillis() - t0
            val genTokens = tokenCount - 1
            val genTime = totalTime - firstTokenTime
            val tps = if (genTime > 0) (genTokens * 1000.0) / genTime else 0.0

            val done = JSONObject().apply {
                put("type", "done")
                put("total_tokens", tokenCount)
                put("ttft_ms", firstTokenTime)
                put("total_time_ms", totalTime)
                put("tokens_per_sec", tps)
                put("backend", activeBackend)
            }
            onChunk(done)

            currentState = State.Ready
        } catch (e: Exception) {
            currentState = State.Failed
            val err = JSONObject().apply {
                put("type", "error")
                put("message", e.message)
            }
            onChunk(err)
        }
    }

    suspend fun unloadModel(): JSONObject = mutex.withLock {
        evictInternal()
        return JSONObject().apply {
            put("status", "UNLOADED")
            put("state", currentState.name)
        }
    }

    suspend fun loadCvModel(modelPath: String, backendPreference: String = "HTP_NPU"): JSONObject = mutex.withLock {
        Log.i(TAG, "Requested loadCvModel: $modelPath (Backend: $backendPreference)")
        if (nativeCvContextHandle != 0L && activeCvModelPath == modelPath) {
            return JSONObject().apply {
                put("status", "ALREADY_LOADED")
                put("model", modelPath)
                put("backend", activeCvBackend)
            }
        }

        if (nativeCvContextHandle != 0L) {
            OnnxCvNativeBridge.freeModel(nativeCvContextHandle)
            nativeCvContextHandle = 0L
        }

        val chosenBackend = when (backendPreference.uppercase()) {
            "HTP", "NPU", "HTP_NPU" -> "HTP_NPU"
            "OPENCL", "GPU" -> "Adreno_OpenCL"
            else -> "Oryon_CPU"
        }

        try {
            nativeCvContextHandle = OnnxCvNativeBridge.loadModel(
                modelPath = modelPath,
                backend = chosenBackend,
                inputSize = 1024,
                threads = 6
            )
            activeCvModelPath = modelPath
            activeCvBackend = chosenBackend

            return JSONObject().apply {
                put("status", "READY")
                put("model", modelPath)
                put("backend", chosenBackend)
                put("resolution", "1024x1024")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load native CV model", e)
            return JSONObject().apply {
                put("status", "ERROR")
                put("message", e.message)
            }
        }
    }

    suspend fun removeBackgroundNative(
        inputRgba: ByteArray,
        width: Int,
        height: Int,
        modelType: String = "birefnet_full",
        refineEdges: Boolean = true
    ): JSONObject = mutex.withLock {
        try {
            // Lazy load default commercial CV model if not initialized
            if (nativeCvContextHandle == 0L) {
                val defaultPath = if (modelType.contains("rmbg")) {
                    File(context.filesDir, "models/rmbg-1.4.onnx").absolutePath
                } else {
                    File(context.filesDir, "models/birefnet-general.onnx").absolutePath
                }
                nativeCvContextHandle = OnnxCvNativeBridge.loadModel(
                    modelPath = defaultPath,
                    backend = "HTP_NPU",
                    inputSize = 1024,
                    threads = 6
                )
                activeCvModelPath = defaultPath
                activeCvBackend = "HTP_NPU"
            }

            val result = OnnxCvNativeBridge.removeBackground(
                contextHandle = nativeCvContextHandle,
                inputRgba = inputRgba,
                width = width,
                height = height,
                refineEdges = refineEdges
            )

            val base64Output = android.util.Base64.encodeToString(result.outputRgba, android.util.Base64.NO_WRAP)
            val base64Alpha = android.util.Base64.encodeToString(result.alphaMask, android.util.Base64.NO_WRAP)

            return JSONObject().apply {
                put("status", "SUCCESS")
                put("output_rgba_base64", base64Output)
                put("alpha_mask_base64", base64Alpha)
                put("width", result.outputWidth)
                put("height", result.outputHeight)
                put("preprocess_ms", result.preprocessMs)
                put("npu_inference_ms", result.npuInferenceMs)
                put("postprocess_ms", result.postprocessMs)
                put("total_ms", result.totalMs)
                put("backend_used", result.backendUsed)
                put("model_name", result.modelName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Native CV background removal failed", e)
            return JSONObject().apply {
                put("status", "ERROR")
                put("message", e.message)
            }
        }
    }

    private fun evictInternal() {
        if (nativeContextHandle != 0L) {
            currentState = State.Evicting
            Log.i(TAG, "Evicting model and purging allocator cache...")
            LlamaNativeBridge.freeModel(nativeContextHandle)
            nativeContextHandle = 0L
            System.gc() // Trigger native allocator cache purge
        }
        activeModelPath = null
        currentState = State.NotLoaded
    }
}

