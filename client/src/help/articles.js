/**
 * Help article index.
 *
 * Each article is defined with metadata here. The markdown body is imported
 * as a raw string using Vite's ?raw query (no build plugin required).
 *
 * To add an article:
 *   1. Create the .md file in client/src/help/articles/
 *   2. Add an entry to this array with the correct slug, title, category, tags, updatedAt
 *   3. Add the import below
 */

import invitePlayers      from './articles/invite-players.md?raw';
import createTournament   from './articles/create-tournament.md?raw';
import hamiltonVsAca      from './articles/hamilton-vs-aca.md?raw';
import upgradeToPro       from './articles/upgrade-to-pro.md?raw';
import publicVsPrivate    from './articles/public-vs-private.md?raw';
import plusMinus          from './articles/plus-minus.md?raw';
import recoverPin         from './articles/recover-pin.md?raw';
import resetPassword      from './articles/reset-password.md?raw';
import refunds            from './articles/refunds.md?raw';
import addVenue           from './articles/add-venue.md?raw';
import weekendPassExpires from './articles/weekend-pass-expires.md?raw';
import cancelSubscription from './articles/cancel-subscription.md?raw';

export const CATEGORIES = [
  'Getting Started',
  'Rules & Scoring',
  'Account',
  'Billing',
];

export const articles = [
  {
    slug: 'invite-players',
    title: 'How do I invite players to my league?',
    category: 'Getting Started',
    tags: ['invite', 'players', 'join', 'link', 'qr', 'share'],
    updatedAt: '2026-06-07',
    body: invitePlayers,
  },
  {
    slug: 'create-tournament',
    title: 'How do I create a tournament?',
    category: 'Getting Started',
    tags: ['tournament', 'bracket', 'round robin', 'pro'],
    updatedAt: '2026-06-07',
    body: createTournament,
  },
  {
    slug: 'hamilton-vs-aca',
    title: "What's the difference between Hamilton Rules and ACA?",
    category: 'Rules & Scoring',
    tags: ['hamilton', 'aca', 'rules', 'scoring', 'cancellation'],
    updatedAt: '2026-06-07',
    body: hamiltonVsAca,
  },
  {
    slug: 'plus-minus',
    title: 'Why does my +/- look different than I expect?',
    category: 'Rules & Scoring',
    tags: ['plus minus', 'stats', 'scoring', 'differential'],
    updatedAt: '2026-06-07',
    body: plusMinus,
  },
  {
    slug: 'public-vs-private',
    title: "What's the difference between public and private leagues?",
    category: 'Getting Started',
    tags: ['public', 'private', 'visibility', 'join', 'invite'],
    updatedAt: '2026-06-07',
    body: publicVsPrivate,
  },
  {
    slug: 'add-venue',
    title: 'How do I add a venue?',
    category: 'Getting Started',
    tags: ['venue', 'location', 'weather', 'gps'],
    updatedAt: '2026-06-07',
    body: addVenue,
  },
  {
    slug: 'upgrade-to-pro',
    title: 'How do I upgrade to Pro?',
    category: 'Billing',
    tags: ['pro', 'upgrade', 'billing', 'subscription', 'weekend pass'],
    updatedAt: '2026-06-07',
    body: upgradeToPro,
  },
  {
    slug: 'weekend-pass-expires',
    title: 'What happens when my Weekend Pass expires?',
    category: 'Billing',
    tags: ['weekend pass', 'expiry', 'downgrade', 'grace period'],
    updatedAt: '2026-06-07',
    body: weekendPassExpires,
  },
  {
    slug: 'cancel-subscription',
    title: 'How do I cancel my subscription?',
    category: 'Billing',
    tags: ['cancel', 'subscription', 'billing', 'pro'],
    updatedAt: '2026-06-07',
    body: cancelSubscription,
  },
  {
    slug: 'refunds',
    title: 'How do refunds work?',
    category: 'Billing',
    tags: ['refund', 'billing', 'money', 'payment'],
    updatedAt: '2026-06-07',
    body: refunds,
  },
  {
    slug: 'reset-password',
    title: 'How do I reset my password?',
    category: 'Account',
    tags: ['password', 'reset', 'forgot', 'login'],
    updatedAt: '2026-06-07',
    body: resetPassword,
  },
  {
    slug: 'recover-pin',
    title: 'How do I recover my PIN?',
    category: 'Account',
    tags: ['pin', 'login', 'forgot', 'legacy', 'claim account'],
    updatedAt: '2026-06-07',
    body: recoverPin,
  },
];

/**
 * Simple keyword search across title + tags + body.
 * Returns articles sorted by relevance (title match > tag match > body match).
 */
export function searchArticles(query) {
  if (!query?.trim()) return articles;
  const q = query.toLowerCase().trim();
  const scored = articles.map((a) => {
    let score = 0;
    if (a.title.toLowerCase().includes(q)) score += 10;
    if (a.tags.some((t) => t.includes(q))) score += 5;
    if (a.body.toLowerCase().includes(q)) score += 1;
    return { ...a, score };
  });
  return scored.filter((a) => a.score > 0).sort((a, b) => b.score - a.score);
}

export function getArticle(slug) {
  return articles.find((a) => a.slug === slug) || null;
}

/**
 * Returns up to 3 related articles based on shared tags, excluding the current article.
 */
export function getRelatedArticles(article, max = 3) {
  if (!article) return [];
  const tagSet = new Set(article.tags);
  const scored = articles
    .filter((a) => a.slug !== article.slug)
    .map((a) => ({ ...a, overlap: a.tags.filter((t) => tagSet.has(t)).length }))
    .filter((a) => a.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, max);
}
