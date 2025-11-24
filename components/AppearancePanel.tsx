import React from 'react';

export type AppearanceSettings = {
  template: 'classic' | 'modern' | 'compact';
  color: 'purple' | 'blue' | 'green' | 'black';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'system' | 'serif' | 'mono';
  spacing: 'compact' | 'normal' | 'relaxed';
  columns: 1 | 2;
  showSections: {
    summary: boolean;
    experience: boolean;
    education: boolean;
    skills: boolean;
    languages: boolean;
    interests: boolean;
  };
  headerStyle: 'uppercase' | 'titlecase' | 'hide';
};

export const defaultAppearance: AppearanceSettings = {
  template: 'classic',
  color: 'purple',
  fontSize: 'medium',
  fontFamily: 'system',
  spacing: 'normal',
  columns: 1,
  showSections: { summary: true, experience: true, education: true, skills: true, languages: true, interests: true },
  headerStyle: 'uppercase'
};

export const AppearancePanel: React.FC<{
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}> = ({ appearance, onChange }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Appearance</h3>
        <div className="text-xs text-slate-500">Click <strong>Save Revision</strong> to persist.</div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-100 dark:border-gray-700 space-y-4">
        {/* Template Preset */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">Template Preset</label>
          <div className="flex gap-2">
            {['classic','modern','compact'].map((t:any) => (
              <button
                key={t}
                onClick={() => onChange({ template: t })}
                className={`px-4 py-2 rounded text-sm transition-colors ${appearance.template === t ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-900 border text-slate-700 dark:text-gray-200'}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Color Preset */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">Color Preset</label>
          <div className="flex gap-2">
            {['purple','blue','green','black'].map((c:any) => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-shadow ${appearance.color === c ? 'ring-2 ring-offset-1 ring-purple-400' : 'border bg-white dark:bg-gray-900'}`}
              >
                <span className={`inline-block w-5 h-5 rounded-full ${c === 'purple' ? 'bg-purple-600' : c === 'blue' ? 'bg-blue-600' : c === 'green' ? 'bg-emerald-600' : 'bg-slate-800'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Font / Spacing */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Font Size</label>
            <select value={appearance.fontSize} onChange={(e) => onChange({ fontSize: e.target.value as any })} className="w-full p-2 rounded border bg-white text-sm">
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Font Family</label>
            <select value={appearance.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value as any })} className="w-full p-2 rounded border bg-white text-sm">
              <option value="system">System</option>
              <option value="serif">Serif</option>
              <option value="mono">Monospace</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Section Spacing</label>
            <select value={appearance.spacing} onChange={(e) => onChange({ spacing: e.target.value as any })} className="w-full p-2 rounded border bg-white text-sm">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
            </select>
          </div>
        </div>

        {/* Columns / Header Style */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-2">Columns</label>
            <div className="flex gap-2">
              <button onClick={() => onChange({ columns: 1 })} className={`flex-1 px-4 py-2 rounded text-sm ${appearance.columns === 1 ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-900 border'}`}>1 Column</button>
              <button onClick={() => onChange({ columns: 2 })} className={`flex-1 px-4 py-2 rounded text-sm ${appearance.columns === 2 ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-900 border'}`}>2 Column</button>
            </div>
          </div>

          <div className="w-48">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Header Style</label>
            <select value={appearance.headerStyle} onChange={(e) => onChange({ headerStyle: e.target.value as any })} className="w-full p-2 rounded border bg-white text-sm">
              <option value="uppercase">Uppercase</option>
              <option value="titlecase">Titlecase</option>
              <option value="hide">Hide</option>
            </select>
          </div>
        </div>

        {/* Show / Hide Sections */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">Show / Hide Sections</label>
          <div className="flex flex-col gap-2 pl-1">
            {Object.entries(appearance.showSections).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v} onChange={(e) => onChange({ showSections: { ...appearance.showSections, [k]: e.target.checked } as any })} className="w-4 h-4 rounded border" />
                <span className="select-none">{k.charAt(0).toUpperCase() + k.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={() => onChange(defaultAppearance)} className="px-3 py-1 bg-white border rounded text-sm">Reset</button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-100 dark:border-gray-700">
        <div className="text-xs text-slate-500 mb-2">Preview</div>
        <div className="w-full h-40 bg-white dark:bg-gray-900 rounded p-3 overflow-auto text-sm" style={{ fontFamily: appearance.fontFamily === 'serif' ? 'Georgia, serif' : appearance.fontFamily === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace' : undefined }}>
          <div style={{ color: appearance.color === 'purple' ? '#7c3aed' : appearance.color === 'blue' ? '#2563eb' : appearance.color === 'green' ? '#059669' : '#111827', fontSize: appearance.fontSize === 'small' ? 12 : appearance.fontSize === 'large' ? 18 : 14 }}>
            <div style={{ fontWeight: 700, textTransform: appearance.headerStyle === 'uppercase' ? 'uppercase' : 'none' }}>John Doe</div>
            <div style={{ marginTop: 6 }}>Professional summary preview with {appearance.columns === 2 ? 'two-column' : 'one-column'} layout.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppearancePanel;
