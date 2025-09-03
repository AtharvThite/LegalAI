import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const MarkdownRenderer = ({ content, className = "" }) => {
  if (!content) return null;

  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Parse markdown to HTML
  const rawHTML = marked.parse(content);
  
  // Sanitize HTML to prevent XSS
  const cleanHTML = DOMPurify.sanitize(rawHTML);

  return (
    <div 
      className={`prose dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: cleanHTML }}
      style={{
        // Light mode colors
        '--tw-prose-body': 'rgb(55 65 81)',
        '--tw-prose-headings': 'rgb(17 24 39)',
        '--tw-prose-lead': 'rgb(75 85 99)',
        '--tw-prose-links': 'rgb(59 130 246)',
        '--tw-prose-bold': 'rgb(17 24 39)',
        '--tw-prose-counters': 'rgb(107 114 128)',
        '--tw-prose-bullets': 'rgb(107 114 128)',
        '--tw-prose-hr': 'rgb(229 231 235)',
        '--tw-prose-quotes': 'rgb(17 24 39)',
        '--tw-prose-quote-borders': 'rgb(229 231 235)',
        '--tw-prose-captions': 'rgb(107 114 128)',
        '--tw-prose-code': 'rgb(17 24 39)',
        '--tw-prose-pre-code': 'rgb(229 231 235)',
        '--tw-prose-pre-bg': 'rgb(17 24 39)',
        '--tw-prose-th-borders': 'rgb(209 213 219)',
        '--tw-prose-td-borders': 'rgb(229 231 235)',
        
        // Dark mode colors - much better contrast
        '--tw-prose-invert-body': 'rgb(229 231 235)',
        '--tw-prose-invert-headings': 'rgb(255 255 255)',
        '--tw-prose-invert-lead': 'rgb(209 213 219)',
        '--tw-prose-invert-links': 'rgb(96 165 250)',
        '--tw-prose-invert-bold': 'rgb(255 255 255)',
        '--tw-prose-invert-counters': 'rgb(156 163 175)',
        '--tw-prose-invert-bullets': 'rgb(156 163 175)',
        '--tw-prose-invert-hr': 'rgb(75 85 99)',
        '--tw-prose-invert-quotes': 'rgb(229 231 235)',
        '--tw-prose-invert-quote-borders': 'rgb(75 85 99)',
        '--tw-prose-invert-captions': 'rgb(156 163 175)',
        '--tw-prose-invert-code': 'rgb(255 255 255)',
        '--tw-prose-invert-pre-code': 'rgb(209 213 219)',
        '--tw-prose-invert-pre-bg': 'rgb(31 41 55)',
        '--tw-prose-invert-th-borders': 'rgb(75 85 99)',
        '--tw-prose-invert-td-borders': 'rgb(55 65 81)',
      }}
    />
  );
};

export default MarkdownRenderer;