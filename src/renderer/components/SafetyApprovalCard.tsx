import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, FolderCheck, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { PendingSafetyRequest, SafetyDecision } from '@shared/types';

interface SafetyApprovalCardProps {
  request: PendingSafetyRequest;
  onDecide: (requestId: string, decision: SafetyDecision) => void;
}

export const SafetyApprovalCard: React.FC<SafetyApprovalCardProps> = ({ request, onDecide }) => {
  const [showPreview, setShowPreview] = useState(false);
  const isCaution = request.riskLevel === 'caution';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
      role="region"
      aria-label="Action approval needed"
      className="mx-auto mb-3 w-full max-w-3xl rounded-2xl border border-strongline bg-surface p-5 shadow-float"
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isCaution ? 'bg-warn-soft text-warn' : 'bg-trust-soft text-trust'
          }`}
        >
          {isCaution ? (
            <ShieldAlert className="h-5 w-5" strokeWidth={1.8} />
          ) : (
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">{request.headline}</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-secondary">
            {request.whatWillHappen}
          </p>

          <div className="mt-2.5 rounded-xl bg-subtle px-3.5 py-2.5 text-xs leading-relaxed text-ink-secondary">
            <span className="font-semibold text-ink">Why AuraDesk is asking: </span>
            {request.whyExplanation}
          </div>

          {request.previewText && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                {showPreview ? (
                  <>
                    Hide content preview
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </>
                ) : (
                  <>
                    Preview exact content
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </>
                )}
              </button>
              {showPreview && (
                <pre className="mt-2 max-h-44 overflow-auto rounded-xl border border-hairline bg-canvas p-3 font-mono text-xs text-ink-secondary">
                  {request.previewText}
                </pre>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onDecide(request.requestId, 'allow_once')}
              className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
              Allow Once
            </button>

            {request.canTrustFolder && request.folderLabel && (
              <button
                type="button"
                onClick={() => onDecide(request.requestId, 'trust_folder')}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl border border-strongline bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle"
              >
                <FolderCheck className="h-3.5 w-3.5 text-trust" strokeWidth={1.9} />
                Trust &ldquo;{request.folderLabel}&rdquo; Folder
              </button>
            )}

            <button
              type="button"
              onClick={() => onDecide(request.requestId, 'block')}
              className="tactile-press inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-danger-soft px-4 py-2 text-xs font-semibold text-danger hover:opacity-90"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Block
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
