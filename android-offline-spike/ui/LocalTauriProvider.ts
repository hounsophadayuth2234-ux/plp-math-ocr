/**
 * LocalTauriProvider - Client AI Provider for Android Offline Factory (Phase 4)
 *
 * Implements the AiProvider interface using Tauri v2 IPC commands (@tauri-apps/api/core)
 * instead of cloud Gemini / Google AI Studio endpoints.
 */

export interface SolutionStep {
  id: string;
  template_id: string;
  title_km: string;
  slots_km: Record<string, any>;
  formula_latex: string;
  result_ref: string;
  badge: string;
}

export interface SolutionBlockIR {
  title_km: string;
  problem_statement_km: string;
  steps: SolutionStep[];
  final_answer: number;
  unit_km: string;
  badge: 'VERIFIED' | 'DRAFT' | 'NEEDS_EXPERT';
}

export interface InferenceChunk {
  chunk_type: 'token' | 'done' | 'error';
  text?: string;
  token_id?: number;
  ttft_ms?: number;
  tokens_per_sec?: number;
  total_tokens?: number;
}

export class LocalTauriProvider {
  private invokeFn: (cmd: string, args?: any) => Promise<any>;

  constructor(customInvoke?: (cmd: string, args?: any) => Promise<any>) {
    if (customInvoke) {
      this.invokeFn = customInvoke;
    } else {
      // In browser/Tauri environment
      const tauriGlobal = (globalThis as any).__TAURI__;
      if (tauriGlobal?.core?.invoke) {
        this.invokeFn = tauriGlobal.core.invoke;
      } else {
        // Fallback for mock/test environments
        this.invokeFn = async (cmd: string, args?: any) => {
          console.warn(`[LocalTauriProvider] Mocking invoke for command: ${cmd}`);
          return null;
        };
      }
    }
  }

  async solveKhmerProblem(problemSpec: {
    id: string;
    type: string;
    question_km: string;
    variables: Record<string, number>;
    unit_km: string;
  }): Promise<SolutionBlockIR> {
    return await this.invokeFn('solve_math_khmer', { spec: problemSpec });
  }

  async saveDraftOffline(req: {
    doc_id: string;
    block_id: string;
    html_content: string;
    parent_rev_id?: string;
    author_id: string;
  }): Promise<{
    doc_id: string;
    block_id: string;
    rev_id: string;
    blake3_checksum: string;
    latency_ms: number;
    status: string;
  }> {
    return await this.invokeFn('save_draft_offline', { req });
  }

  async getThermalStatus(): Promise<{
    thermal_status: number;
    thermal_label: string;
    headroom: number;
    policy: string;
  }> {
    return await this.invokeFn('get_thermal_status');
  }
}

