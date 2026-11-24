import crypto from 'node:crypto';
import type { PendingSafetyRequest, SafetyDecision } from '@shared/types';

interface PendingEntry {
  request: PendingSafetyRequest;
  resolve: (decision: SafetyDecision) => void;
  timer: NodeJS.Timeout;
}

export class SafetyGate {
  private pending = new Map<string, PendingEntry>();
  private onRequestCallback: ((req: PendingSafetyRequest) => void) | null = null;
  private onResolvedCallback:
    | ((requestId: string, decision: SafetyDecision, req: PendingSafetyRequest) => void)
    | null = null;

  public onRequest(cb: (req: PendingSafetyRequest) => void): void {
    this.onRequestCallback = cb;
  }

  public onResolved(
    cb: (requestId: string, decision: SafetyDecision, req: PendingSafetyRequest) => void
  ): void {
    this.onResolvedCallback = cb;
  }

  public requestApproval(
    params: Omit<PendingSafetyRequest, 'requestId' | 'createdAt'>,
    timeoutMs = 5 * 60 * 1000
  ): Promise<SafetyDecision> {
    const request: PendingSafetyRequest = {
      ...params,
      requestId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    return new Promise<SafetyDecision>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.has(request.requestId)) {
          this.pending.delete(request.requestId);
          this.onResolvedCallback?.(request.requestId, 'block', request);
          resolve('block');
        }
      }, timeoutMs);

      this.pending.set(request.requestId, {
        request,
        resolve,
        timer,
      });

      this.onRequestCallback?.(request);
    });
  }

  public resolveRequest(requestId: string, decision: SafetyDecision): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    this.onResolvedCallback?.(requestId, decision, entry.request);
    entry.resolve(decision);
    return true;
  }

  public cancelAllForConversation(conversationId: string): void {
    for (const [id, entry] of this.pending.entries()) {
      if (entry.request.conversationId === conversationId) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        this.onResolvedCallback?.(id, 'block', entry.request);
        entry.resolve('block');
      }
    }
  }
}
