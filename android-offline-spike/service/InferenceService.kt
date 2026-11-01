package com.plp.math.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.LocalServerSocket
import android.net.LocalSocket
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.util.concurrent.atomic.AtomicBoolean

/**
 * PLP Math Offline Factory - Inference Foreground Service (Phase 3)
 *
 * Dedicated process boundary: android:process=":inference"
 * 
 * Invariants:
 * 1. Strictly isolated from the UI process; an lmkd kill or native SIGSEGV
 *    of llama.cpp cannot crash the Tauri UI or drop unsaved Jodit drafts.
 * 2. Skips all Tauri and WebView initialization to eliminate WebView memory overhead.
 * 3. Operates as an Android Foreground Service with low oom_score_adj.
 * 4. Communicates with Tauri main process via Android LocalSocket (UNIX domain socket).
 */
class InferenceService : Service() {

    companion object {
        private const val TAG = "PLPMath:InferenceService"
        const val SOCKET_NAME = "plp_math_inference_ipc"
        private const val NOTIFICATION_CHANNEL_ID = "plp_inference_channel"
        private const val NOTIFICATION_ID = 4040
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var serverSocket: LocalServerSocket? = null
    private val isRunning = AtomicBoolean(false)
    private var modelBroker: ModelBroker? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing InferenceService in isolated process :inference [PID=${android.os.Process.myPid()}]")
        
        // Ensure NO WebView or Tauri initialization occurs in this process
        startAsForegroundService()
        modelBroker = ModelBroker(applicationContext)
        startIpcServer()
    }

    private fun startAsForegroundService() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "PLP Math Offline AI Engine",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background AI inference engine for Khmer math solving and OCR"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle("PLP Math AI Engine Active")
                .setContentText("Local inference running in isolated process :inference")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("PLP Math AI Engine Active")
                .setContentText("Local inference running in isolated process :inference")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true)
                .build()
        }

        startForeground(NOTIFICATION_ID, notification)
    }

    private fun startIpcServer() {
        isRunning.set(true)
        serviceScope.launch {
            try {
                serverSocket = LocalServerSocket(SOCKET_NAME)
                Log.i(TAG, "LocalServerSocket listening on @$SOCKET_NAME")
                while (isRunning.get()) {
                    val clientSocket = serverSocket?.accept() ?: break
                    launch { handleClient(clientSocket) }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in IPC server loop", e)
            }
        }
    }

    private suspend fun handleClient(socket: LocalSocket) = withContext(Dispatchers.IO) {
        var reader: BufferedReader? = null
        var writer: PrintWriter? = null
        try {
            reader = BufferedReader(InputStreamReader(socket.inputStream))
            writer = PrintWriter(socket.outputStream, true)

            while (isRunning.get()) {
                val line = reader.readLine() ?: break
                if (line.isBlank()) continue

                val request = JSONObject(line)
                val action = request.optString("action")

                when (action) {
                    "PING" -> {
                        val resp = JSONObject().apply {
                            put("status", "PONG")
                            put("pid", android.os.Process.myPid())
                            put("process", ":inference")
                        }
                        writer.println(resp.toString())
                    }

                    "LOAD_MODEL" -> {
                        val modelPath = request.getString("model_path")
                        val backend = request.optString("backend", "AUTO")
                        val result = modelBroker?.loadModel(modelPath, backend)
                        writer.println(result.toString())
                    }

                    "UNLOAD_MODEL" -> {
                        val result = modelBroker?.unloadModel()
                        writer.println(result.toString())
                    }

                    "STREAM_INFERENCE" -> {
                        val prompt = request.getString("prompt")
                        val maxTokens = request.optInt("max_tokens", 256)
                        val temperature = request.optDouble("temperature", 0.2)
                        
                        // Stream tokens back over the socket line by line
                        modelBroker?.streamInference(prompt, maxTokens, temperature.toFloat()) { tokenChunk ->
                            writer.println(tokenChunk.toString())
                        }
                    }

                    "GET_STATUS" -> {
                        val status = modelBroker?.getStatus() ?: JSONObject()
                        status.put("pid", android.os.Process.myPid())
                        writer.println(status.toString())
                    }

                    else -> {
                        val err = JSONObject().apply {
                            put("status", "ERROR")
                            put("message", "Unknown action: $action")
                        }
                        writer.println(err.toString())
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Client socket communication error", e)
        } finally {
            try { reader?.close() } catch (_: Exception) {}
            try { writer?.close() } catch (_: Exception) {}
            try { socket.close() } catch (_: Exception) {}
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning.set(false)
        try { serverSocket?.close() } catch (_: Exception) {}
        serviceScope.cancel()
        Log.i(TAG, "InferenceService destroyed")
    }
}

