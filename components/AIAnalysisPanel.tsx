import React, { useState } from 'react';
import { AlertCircle, Wand2, RefreshCw, Sparkles } from 'lucide-react';
import { Resume, AnalysisIssue } from '../types';

interface Props {
  resumeData: Resume;
  onAnalyze: () => void;
  onSuggest: (issue: AnalysisIssue) => void;
  onApplyFix: (issue: AnalysisIssue) => void;
  onInputChange: (section: string, field: string, value: string, id?: string) => void;
}

export const AIAnalysisPanel: React.FC<Props> = ({ resumeData, onAnalyze, onSuggest, onApplyFix, onInputChange }) => {
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const issues = resumeData.analysis?.issues || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-500" /> Action Items
        </h3>
        <span className="text-xs font-medium bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-2 py-1 rounded-full text-slate-600 dark:text-gray-300">{issues.length} remaining</span>
      </div>

      <div className="space-y-4">
        {issues.length === 0 && (
          <div className="text-center p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
            <AlertCircle size={32} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">All clear! No critical issues found.</p>
          </div>
        )}

        {issues.map(issue => (
          <div key={issue.id} className="p-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-all">
            <div className="flex gap-3 items-start">
              <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${issue.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-gray-200">{issue.title}</h4>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">{issue.description}</p>

                <div className="mt-3 flex gap-2">
                  <button onClick={() => onSuggest(issue)} className="text-xs px-2 py-1 bg-white border rounded flex items-center gap-2"><Wand2 size={12} /> Improve with Gemini</button>
                  <button onClick={() => setOpenIssueId(openIssueId === issue.id ? null : issue.id)} className="text-xs px-2 py-1 bg-slate-50 dark:bg-gray-700/50 border rounded">{openIssueId === issue.id ? 'Close' : 'Open'}</button>
                </div>

                {/* Inline panel */}
                {openIssueId === issue.id && (
                  <div className="mt-4 p-3 bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 rounded-lg shadow-lg">
                    <div className="text-xs text-slate-500 mb-2">Affected: <span className="font-medium text-slate-700 dark:text-gray-200">{issue.fixAction?.targetSection || 'document'}</span></div>
                    <div className="mb-3">
                      <strong className="text-sm">Run improvements:</strong>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => onSuggest(issue)} className="px-3 py-1 bg-purple-600 text-white rounded text-sm">Run Gemini</button>
                        <button onClick={() => onApplyFix(issue)} className="px-3 py-1 bg-emerald-600 text-white rounded text-sm">Apply Fix (preview)</button>
                      </div>
                    </div>

                    <div className="text-sm text-slate-500">Suggestions appear here after running Gemini. Edit inline then Apply to preview locally. Use Save Revision to persist.</div>
                  </div>
                )}

              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIAnalysisPanel;
