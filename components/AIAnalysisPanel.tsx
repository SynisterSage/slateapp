import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import AnalysisCard from './AnalysisCard';
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
          <AnalysisCard
            key={issue.id}
            issue={issue}
            isOpen={openIssueId === issue.id}
            onToggle={() => setOpenIssueId(openIssueId === issue.id ? null : issue.id)}
            onSuggest={onSuggest}
            onApplyFix={onApplyFix}
          />
        ))}
      </div>
    </div>
  );
};

export default AIAnalysisPanel;
