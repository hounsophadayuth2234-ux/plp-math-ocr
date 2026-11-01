use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProblemSpec {
    pub id: String,
    pub problem_type: String,
    pub question_km: String,
    pub variables: serde_json::Value,
    pub expected_answer: Option<f64>,
    pub unit_km: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolutionStep {
    pub id: String,
    pub template_id: String,
    pub title_km: String,
    pub slots_km: serde_json::Value,
    pub formula_latex: String,
    pub result_ref: String,
    pub badge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolutionBlockIR {
    pub title_km: String,
    pub problem_statement_km: String,
    pub steps: Vec<SolutionStep>,
    pub final_answer: f64,
    pub unit_km: String,
    pub badge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceTokenChunk {
    pub chunk_type: String, // "token" | "done" | "error"
    pub text: Option<String>,
    pub token_id: Option<u32>,
    pub ttft_ms: Option<f64>,
    pub tokens_per_sec: Option<f64>,
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftSaveRequest {
    pub doc_id: String,
    pub block_id: String,
    pub html_content: String,
    pub parent_rev_id: Option<String>,
    pub author_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftSaveResponse {
    pub doc_id: String,
    pub block_id: String,
    pub rev_id: String,
    pub blake3_checksum: String,
    pub latency_ms: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionVerificationResult {
    pub allowed: bool,
    pub user_id: Option<String>,
    pub role: Option<String>,
    pub remaining_seconds: Option<i64>,
    pub reason: Option<String>,
    pub residual_risk_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BgRemovalRequest {
    pub image_base64: String,
    pub width: u32,
    pub height: u32,
    pub model_type: Option<String>, // "birefnet_full" | "rmbg_1_4"
    pub refine_edges: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BgRemovalResponse {
    pub status: String,
    pub output_rgba_base64: Option<String>,
    pub alpha_mask_base64: Option<String>,
    pub width: u32,
    pub height: u32,
    pub preprocess_ms: u64,
    pub npu_inference_ms: u64,
    pub postprocess_ms: u64,
    pub total_ms: u64,
    pub backend_used: String,
    pub model_name: String,
    pub error: Option<String>,
}


