import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: any = {
  a: ({node, ...props}: any) => <a {...props} className="text-purple-600 hover:underline" />,
  h1: ({node, ...props}: any) => <h1 {...props} className="text-2xl font-bold mt-4 mb-2" />,
  h2: ({node, ...props}: any) => <h2 {...props} className="text-xl font-semibold mt-4 mb-2" />,
  h3: ({node, ...props}: any) => <h3 {...props} className="text-lg font-semibold mt-3 mb-1" />,
  p: ({node, ...props}: any) => <p {...props} className="text-sm text-gray-700 dark:text-gray-300 mb-2" />,
  ul: ({node, ...props}: any) => <ul {...props} className="list-disc list-inside ml-4 space-y-1" />,
  ol: ({node, ...props}: any) => <ol {...props} className="list-decimal list-inside ml-4 space-y-1" />,
  code: ({node, inline, className, children, ...props}: any) => (
    <code className={`px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs ${inline ? '' : 'block overflow-auto p-3'}`} {...props}>{children}</code>
  )
};

const MarkdownRenderer: React.FC<{ source: string }> = ({ source }) => {
  return (
    <div className="prose max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{source}</ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
