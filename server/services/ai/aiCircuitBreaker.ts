/**
 * Centralized AI Circuit Breaker and Quota Management Service
 * Prevents redundant external calls, unhandled errors, and warning log spam
 * when Gemini API prepayment credits or rate limits are depleted.
 */

import { structuredLogger } from '../../logging/structuredLogger';

export class AiCircuitBreaker {
  private static instance: AiCircuitBreaker;
  private quotaExhaustedUntil: number = 0;
  private isPrepaymentDepletedState: boolean = false;
  private lastReason: string = '';

  private constructor() {
    // Initial check: if there's no API key configured, flag as unconfigured
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      this.lastReason = 'API_KEY_UNCONFIGURED';
    }
  }

  public static getInstance(): AiCircuitBreaker {
    if (!AiCircuitBreaker.instance) {
      AiCircuitBreaker.instance = new AiCircuitBreaker();
    }
    return AiCircuitBreaker.instance;
  }

  public getModelName(): string {
    return 'gemini-3.8-flash';
  }

  public isQuotaExhausted(): boolean {
    if (this.isPrepaymentDepletedState) return true;
    if (this.quotaExhaustedUntil > Date.now()) return true;
    return false;
  }

  public isPrepaymentDepleted(): boolean {
    return this.isPrepaymentDepletedState;
  }

  public canExecuteAi(): boolean {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) return false;
    if (this.isQuotaExhausted()) return false;
    return true;
  }

  public getStatus() {
    return {
      canExecute: this.canExecuteAi(),
      isQuotaExhausted: this.isQuotaExhausted(),
      isPrepaymentDepleted: this.isPrepaymentDepletedState,
      reason: this.lastReason || (this.isQuotaExhausted() ? 'PREPAYMENT_CREDITS_DEPLETED' : 'ACTIVE'),
      model: this.getModelName()
    };
  }

  public recordSuccess(): void {
    this.quotaExhaustedUntil = 0;
    this.isPrepaymentDepletedState = false;
    this.lastReason = '';
  }

  public reset(): void {
    this.recordSuccess();
  }

  /**
   * Gracefully handles and tracks Gemini errors.
   * Prevents raw error dumps and alerts downstream services to switch to deterministic fallback.
   */
  public handleAiError(serviceName: string, err: unknown): { isQuotaIssue: boolean; reason: string } {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const isPrepayment =
      rawMsg.includes('402') ||
      rawMsg.toLowerCase().includes('prepayment') ||
      rawMsg.includes('depleted') ||
      rawMsg.includes('RESOURCE_EXHAUSTED');
    const isRateLimit = rawMsg.includes('429') || rawMsg.includes('QUOTA_EXCEEDED');

    if (isPrepayment || isRateLimit) {
      this.isPrepaymentDepletedState = isPrepayment;
      // Back off for 15 minutes before retrying API calls
      this.quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
      this.lastReason = isPrepayment ? 'PREPAYMENT_CREDITS_DEPLETED' : 'RATE_LIMIT_EXCEEDED';

      try {
        structuredLogger.info(`[${serviceName}] Institutional intelligence active (deterministic template fallback engaged).`, {
          metadata: {
            service: serviceName,
            status: this.lastReason
          }
        });
      } catch {
        // Safe fallback
      }

      return {
        isQuotaIssue: true,
        reason: this.lastReason
      };
    }

    this.lastReason = 'TRANSIENT_AI_UNAVAILABLE';
    return {
      isQuotaIssue: false,
      reason: 'TRANSIENT_AI_UNAVAILABLE'
    };
  }
}

export const aiCircuitBreaker = AiCircuitBreaker.getInstance();
