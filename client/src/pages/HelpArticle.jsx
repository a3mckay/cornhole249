import React, { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getArticle, getRelatedArticles } from '../help/articles';
import { capture } from '../lib/analytics';

export default function HelpArticle() {
  const { slug } = useParams();
  const article = getArticle(slug);
  const [feedback, setFeedback] = useState(null); // null | 'yes' | 'no'

  if (!article) return <Navigate to="/help" replace />;

  const related = getRelatedArticles(article);

  const handleFeedback = (value) => {
    if (feedback) return; // already voted
    setFeedback(value);
    capture('help_feedback_given', { article: slug, helpful: value === 'yes' });
  };

  return (
    <div className="max-w-2xl mx-auto mt-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <Link to="/help" className="hover:opacity-75 transition-opacity">Help</Link>
        <span>›</span>
        <span>{article.category}</span>
        <span>›</span>
        <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{article.title}</span>
      </div>

      {/* Article */}
      <article className="card p-7">
        {/* Article last updated */}
        <div className="font-ui text-xs mb-4" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          Updated {new Date(article.updatedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>

        <div className="prose-help">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="font-display text-3xl mb-4" style={{ color: 'var(--color-text-primary)' }}>{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-display text-xl mt-7 mb-3" style={{ color: 'var(--color-text-primary)' }}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-ui text-base font-bold mt-5 mb-2" style={{ color: 'var(--color-text-primary)' }}>{children}</h3>
              ),
              p: ({ children }) => (
                <p className="font-ui text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-primary)' }}>{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 pl-5" style={{ listStyleType: 'disc' }}>{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 pl-5" style={{ listStyleType: 'decimal' }}>{children}</ol>
              ),
              li: ({ children }) => (
                <li className="font-ui text-sm mb-1.5 leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{children}</li>
              ),
              a: ({ href, children }) => {
                const isInternal = href?.startsWith('/');
                return isInternal ? (
                  <Link to={href} className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>
                    {children}
                  </Link>
                ) : (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>
                    {children}
                  </a>
                );
              },
              strong: ({ children }) => (
                <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</strong>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm font-ui border-collapse" style={{ borderColor: 'var(--color-border)' }}>
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead style={{ background: 'var(--color-surface)' }}>{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-3 py-2 text-left font-semibold border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-2 border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>{children}</td>
              ),
              code: ({ children }) => (
                <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>{children}</code>
              ),
              hr: () => (
                <hr className="my-6" style={{ borderColor: 'var(--color-border)' }} />
              ),
            }}
          >
            {article.body}
          </ReactMarkdown>
        </div>
      </article>

      {/* Was this helpful? */}
      <div
        className="mt-6 rounded-2xl px-6 py-4 flex items-center justify-between gap-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <span className="font-ui text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Was this helpful?
        </span>
        {feedback ? (
          <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {feedback === 'yes' ? '👍 Thanks for the feedback!' : '👎 Thanks — we\'ll improve this.'}
          </span>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleFeedback('yes')}
              className="px-4 py-1.5 rounded-xl border font-ui text-sm font-semibold transition-all hover:opacity-75"
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'rgba(58,107,53,0.07)' }}
            >
              👍 Yes
            </button>
            <button
              onClick={() => handleFeedback('no')}
              className="px-4 py-1.5 rounded-xl border font-ui text-sm font-semibold transition-all hover:opacity-75"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-bg)' }}
            >
              👎 No
            </button>
          </div>
        )}
      </div>

      {/* Related articles */}
      {related.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Related articles
          </h3>
          <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {related.map((a) => (
              <Link
                key={a.slug}
                to={`/help/${a.slug}`}
                className="flex items-center justify-between px-5 py-3.5 hover:opacity-75 transition-opacity"
              >
                <span className="font-ui text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {a.title}
                </span>
                <span style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Contact fallback */}
      <div className="mt-8 text-center pb-4">
        <p className="font-ui text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Didn't find what you were looking for?
        </p>
        <Link to="/help/contact" className="font-ui text-sm font-semibold underline" style={{ color: 'var(--color-primary)' }}>
          Contact us →
        </Link>
      </div>
    </div>
  );
}
