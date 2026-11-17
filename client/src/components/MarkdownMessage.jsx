import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Safe markdown rendering via React elements (skipHtml; no raw HTML pipeline).
 * remark-gfm: tables, strikethrough, task lists.
 */
export default function MarkdownMessage({ children }) {
  const text = String(children ?? '');
  if (!text.trim()) return null;

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {c}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
