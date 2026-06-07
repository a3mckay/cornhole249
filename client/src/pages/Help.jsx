import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { articles, CATEGORIES, searchArticles } from '../help/articles';

export default function Help() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    return query.trim() ? searchArticles(query) : null;
  }, [query]);

  const grouped = useMemo(() => {
    const map = {};
    for (const cat of CATEGORIES) map[cat] = [];
    for (const a of articles) {
      if (map[a.category]) map[a.category].push(a);
    }
    return map;
  }, []);

  return (
    <div className="max-w-2xl mx-auto mt-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Help Center
        </h1>
        <p className="font-ui" style={{ color: 'var(--color-text-secondary)' }}>
          Answers to common questions about Cornhole249.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <input
          type="search"
          placeholder="Search articles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 pl-11 rounded-2xl border font-ui text-sm"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Search results */}
      {results !== null && (
        <div className="mb-6">
          {results.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                No articles match "{query}".
              </p>
              <Link to="/help/contact" className="btn btn-primary text-sm mt-4 inline-block px-4 py-2">
                Contact us →
              </Link>
            </div>
          ) : (
            <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {results.map((a) => (
                <Link
                  key={a.slug}
                  to={`/help/${a.slug}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:opacity-75 transition-opacity"
                >
                  <div>
                    <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {a.title}
                    </div>
                    <div className="font-ui text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {a.category}
                    </div>
                  </div>
                  <span style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category listing (shown when not searching) */}
      {results === null && (
        <div className="flex flex-col gap-6">
          {CATEGORIES.map((cat) => (
            grouped[cat]?.length > 0 && (
              <div key={cat}>
                <h2 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  {cat}
                </h2>
                <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {grouped[cat].map((a) => (
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
            )
          ))}
        </div>
      )}

      {/* Contact CTA */}
      <div
        className="mt-10 rounded-2xl px-6 py-5 flex items-center justify-between gap-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div>
          <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
            Still have questions?
          </div>
          <div className="font-ui text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            We usually respond within a day.
          </div>
        </div>
        <Link to="/help/contact" className="btn btn-primary text-sm px-4 py-2 flex-shrink-0">
          Contact us →
        </Link>
      </div>
    </div>
  );
}
