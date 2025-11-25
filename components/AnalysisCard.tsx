import React from 'react';
import { ChevronDown, Wand2, CheckCircle, RefreshCw } from 'lucide-react';
import { AnalysisIssue } from '../types';

interface Props {
  issue: AnalysisIssue;
  isOpen: boolean;
  onToggle: () => void;
  onSuggest: (issue: AnalysisIssue) => void;
  onApplyFix: (issue: AnalysisIssue) => void;
  isApplying?: boolean;
  onApplyCandidate?: (issue: AnalysisIssue, candidate?: string) => void;
}

const scoreColor = (score?: number) => {
  if (score === undefined) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-rose-500';
};

export const AnalysisCard: React.FC<Props> = ({ issue, isOpen, onToggle, onSuggest, onApplyFix, isApplying, onApplyCandidate }) => {
  const score = issue.score ?? null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-xl shadow-sm">
      <button
        aria-expanded={isOpen}
        onClick={onToggle}
        className="w-full text-left p-3 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-xl"
      >
        <div className={`shrink-0 mt-0.5 ${issue.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'} w-2 h-2 rounded-full`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">{issue.title}</h4>
              {issue.description && <p className="text-xs text-slate-500 dark:text-gray-400 truncate mt-1">{issue.description}</p>}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {score !== null ? (
                  <div className={`text-sm font-semibold ${scoreColor(score)} mr-1`} aria-hidden>{score}</div>
                ) : (
                  <div className="text-sm text-slate-400">—</div>
                )}
              </div>

              <ChevronDown className={`w-4 h-4 text-slate-400 transform transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
            </div>
          </div>
        </div>
      </button>

      <div className={`overflow-hidden transition-[height,opacity] ${isOpen ? 'p-3' : 'max-h-0 p-0'} `} aria-hidden={!isOpen}>
        {isOpen && (
          <div className="text-sm text-slate-600 dark:text-gray-300">
            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-1">Affected: <span className="font-medium text-slate-700 dark:text-gray-200">{issue.fixAction?.targetSection || 'document'}</span></div>
              <div className="bg-slate-50 dark:bg-gray-900 p-3 rounded-md border border-slate-100 dark:border-gray-800">
                {issue.details || <span className="text-slate-500">No additional details provided.</span>}
              </div>
            </div>

            {issue.suggestion && (
              <div className="mb-4 bg-slate-50 dark:bg-gray-900 p-4 rounded-lg border border-slate-100 dark:border-gray-800 text-sm text-slate-700 dark:text-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-slate-800 dark:text-gray-100 flex items-center gap-2"><Wand2 size={14} />Suggestion</div>
                </div>
                <div className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-gray-300">{issue.suggestion}</div>
                {/* suggestion candidates are intentionally not shown inline to avoid duplicate apply controls; use the Apply Suggestion button next to Suggest Rewrite */}
              </div>
            )}

            <div className="flex gap-2 items-center">
              {score !== null && score >= 100 ? (
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle size={16} /> No rewrites suggested
                </div>
              ) : (
                <button onClick={() => onSuggest(issue)} className="px-3 py-2 bg-purple-600 text-white rounded-md text-sm flex items-center gap-2 shadow-sm">
                  <Wand2 size={14} /> Suggest Rewrite
                </button>
              )}

              {/* Apply Suggestion: primary green action, disabled until suggestion exists */}
              <button
                onClick={() => {
                  const primary = issue.suggestionCandidates && issue.suggestionCandidates.length ? issue.suggestionCandidates[0] : issue.suggestion;
                  if (primary && onApplyCandidate) onApplyCandidate(issue, primary);
                }}
                disabled={!(issue.suggestion || (issue.suggestionCandidates && issue.suggestionCandidates.length > 0))}
                title={!(issue.suggestion || (issue.suggestionCandidates && issue.suggestionCandidates.length > 0)) ? 'Run Suggest Rewrite to enable' : ''}
                className={`px-3 py-2 ${issue.suggestion || (issue.suggestionCandidates && issue.suggestionCandidates.length > 0) ? 'bg-emerald-600' : 'bg-emerald-200 cursor-not-allowed'} text-white rounded-md text-sm flex items-center gap-2 shadow-sm`}
              >
                <RefreshCw size={14} /> Apply Suggestion
              </button>

              {/* Apply Fix removed from suggestion actions per design — Apply Suggestion covers this flow */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisCard;
