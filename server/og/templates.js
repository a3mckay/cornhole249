// Card templates. Each exports a function that takes data and returns a
// satori element. The shared `frame()` wraps every card with the cream
// background, padding, and the permanent "Cornhole249" watermark footer.

const { h } = require('./render');

const C = {
  bg: '#F5EFE0',           // page cream
  surface: '#FDFAF5',      // paper-white card body
  border: '#C8B89A',       // warm tan
  textPrimary: '#2C2416',  // dark brown
  textSecondary: '#5C3A1E',
  primary: '#3A6B35',      // league green
  secondary: '#D48B2D',    // amber orange
  danger: '#B94040',
  gold: '#D4B017',
};

// Mirrors WeatherBadge.jsx — maps condition string → emoji.
const WEATHER_EMOJI = {
  'Clear':         '☀️',
  'Partly Cloudy': '⛅',
  'Overcast':      '☁️',
  'Fog':           '🌫️',
  'Drizzle':       '🌦️',
  'Rain':          '🌧️',
  'Heavy Rain':    '⛈️',
  'Snow':          '❄️',
  'Thunderstorm':  '⛈️',
  'Unknown':       '🌡️',
};

const PALETTES = [
  '#3A6B35', '#D48B2D', '#B94040', '#6366F1', '#EC4899',
  '#14B8A6', '#F59E0B', '#8B5CF6', '#06B6D4', '#84CC16',
];

function avatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

// Avatar renders a circular player photo when avatarUrl is supplied, and
// falls back to an initials circle when it isn't (or on load error).
// avatarUrl must be a data URL or an absolute HTTPS URL — satori can't
// resolve relative paths.  DiceBear URLs should already be /png format
// (not /svg) before being passed here.
function Avatar(name, size = 80, avatarUrl = null) {
  const ringStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.85)',
    boxShadow: '0 4px 12px rgba(44,36,22,0.18)',
    overflow: 'hidden',
    display: 'flex',
    flexShrink: 0,
  };

  if (avatarUrl) {
    return h(
      'div',
      { style: ringStyle },
      h('img', {
        src: avatarUrl,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      })
    );
  }

  // Initials fallback
  const initials = (name || '?')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return h(
    'div',
    {
      style: {
        ...ringStyle,
        background: avatarColor(name || ''),
        color: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Nunito',
        fontSize: Math.round(size * 0.4),
        fontWeight: 900,
      },
    },
    initials
  );
}

// Watermark footer: always present on every card, free or Pro.
function Watermark({ caption }) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 48px',
        height: 60,
        background: C.textPrimary,
        color: '#F5EFE0',
        fontFamily: 'Nunito',
        fontSize: 18,
        fontWeight: 700,
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 12 } },
      h('span', { style: { fontFamily: 'Abril Fatface', fontSize: 26 } }, 'Cornhole249'),
      h(
        'span',
        { style: { opacity: 0.6, fontSize: 15 } },
        caption || 'your league, your crew, your rules'
      )
    ),
    h('div', { style: { opacity: 0.7, fontSize: 15 } }, 'cornhole249.com')
  );
}

// Shared frame: cream background, content area, watermark at the bottom.
function frame(body, { footerCaption } = {}) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        fontFamily: 'Nunito',
      },
    },
    h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: 48 } }, body),
    Watermark({ caption: footerCaption })
  );
}

// Tournament-specific frame: replaces the in-body header with a dark title
// "ribbon" at the top edge of the card. Gives tournament cards a distinct
// sports-broadcast feel and mirrors the dark watermark band at the bottom.
function tournamentRibbon({ name, statusLabel, statusColor, statusBg, subline, gameType }) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 48px 20px 48px',
        background: C.textPrimary, // deep brown — matches watermark band
        color: '#F5EFE0',
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        },
      },
      h(
        'div',
        {
          style: {
            fontFamily: 'Abril Fatface',
            fontSize: 42,
            lineHeight: 1,
            color: '#F5EFE0',
          },
        },
        name
      ),
      statusLabel
        ? h(
            'div',
            {
              style: {
                padding: '6px 16px',
                borderRadius: 999,
                background: statusBg,
                color: statusColor,
                fontFamily: 'Nunito',
                fontSize: 14,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
              },
            },
            statusLabel
          )
        : null
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        },
      },
      h(
        'div',
        {
          style: {
            fontFamily: 'Nunito',
            fontSize: 16,
            fontWeight: 700,
            color: 'rgba(245,239,224,0.65)',
            letterSpacing: 0.4,
          },
        },
        subline
      ),
      gameType
        ? h(
            'div',
            {
              style: {
                padding: '2px 12px',
                borderRadius: 999,
                background: gameType === '2v2' ? '#7C3AED' : '#9A4F0E',
                color: '#fff',
                fontFamily: 'Nunito',
                fontSize: 13,
                fontWeight: 900,
              },
            },
            gameType
          )
        : null
    )
  );
}

function tournamentFrame(body, header, { footerCaption } = {}) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        fontFamily: 'Nunito',
      },
    },
    header,
    h(
      'div',
      {
        style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '28px 48px' },
      },
      body
    ),
    Watermark({ caption: footerCaption })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME CARD
// Layout: header (league + date), two team columns with avatars + score, with
// a thick "vs" pillar between them. Winner's column has a subtle green tint
// and trophy emoji. Footer band shows venue + weather emoji.
// ─────────────────────────────────────────────────────────────────────────────
function gameCard(game) {
  const team1Won = game.t1Score > game.t2Score;
  const date = new Date(game.played_at).toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // team is now an array of {name, avatarUrl} objects
  const TeamCol = (team, score, won) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flex: 1,
          padding: 28,
          background: won ? 'rgba(58,107,53,0.10)' : 'rgba(44,36,22,0.03)',
          borderRadius: 24,
          border: won
            ? `3px solid ${C.primary}`
            : '2px solid rgba(44,36,22,0.10)',
          opacity: won ? 1 : 0.85,
        },
      },
      h(
        'div',
        { style: { display: 'flex', gap: -12, marginBottom: 14 } },
        ...team.map((p, i) =>
          h(
            'div',
            { style: { marginLeft: i > 0 ? -16 : 0, display: 'flex' } },
            Avatar(p.name, 76, p.avatarUrl)
          )
        )
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Nunito',
            fontSize: 24,
            fontWeight: 700,
            color: C.textPrimary,
            textAlign: 'center',
            marginBottom: 6,
          },
        },
        team.map((p) => p.name).join(' & ')
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Abril Fatface',
            fontSize: 112,
            lineHeight: 1,
            color: won ? C.primary : C.textSecondary,
          },
        },
        String(score)
      ),
      won &&
        h(
          'div',
          { style: { fontSize: 36, marginTop: 2, display: 'flex' } },
          '🏆'
        )
    );

  return frame(
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
      // Header strip
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 44,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: 'Nunito',
              fontSize: 22,
              fontWeight: 700,
              color: C.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            },
          },
          h(
            'div',
            {
              style: {
                background: game.game_type === '2v2' ? '#E9D5FF' : '#FCE7D2',
                color: game.game_type === '2v2' ? '#7C3AED' : '#9A4F0E',
                padding: '4px 14px',
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 900,
              },
            },
            game.game_type
          ),
          h('span', null, game.league_name || 'Cornhole249')
        ),
        h(
          'div',
          {
            style: { fontFamily: 'Nunito', fontSize: 20, color: C.textSecondary },
          },
          date
        )
      ),
      // Body: two team columns with VS between
      h(
        'div',
        {
          style: {
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            gap: 16,
          },
        },
        TeamCol(game.team1, game.t1Score, team1Won),
        h(
          'div',
          {
            style: {
              fontFamily: 'Abril Fatface',
              fontSize: 56,
              color: C.textSecondary,
              opacity: 0.45,
            },
          },
          'VS'
        ),
        TeamCol(game.team2, game.t2Score, !team1Won)
      ),
      // Venue + weather strip
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 44,
            fontFamily: 'Nunito',
            fontSize: 20,
            color: C.textSecondary,
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', null, '📍'),
          h(
            'span',
            { style: { fontWeight: 700, color: C.textPrimary } },
            game.venue || 'Somewhere'
          )
        ),
        game.weather &&
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255,255,255,0.55)',
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                padding: '6px 16px 6px 10px',
              },
            },
            // Large weather emoji rendered via Twemoji
            h('span', { style: { fontSize: 32, display: 'flex', lineHeight: 1 } },
              game.weather.emoji || WEATHER_EMOJI[game.weather.condition] || '🌡️'
            ),
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
              h('span', { style: { fontWeight: 700, fontSize: 18, color: C.textPrimary, lineHeight: 1.2 } },
                game.weather.condition
              ),
              h('span', { style: { fontSize: 15, color: C.textSecondary, lineHeight: 1.2 } },
                `${game.weather.temp_c}°C`
              )
            )
          )
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER CARD
// Layout: big avatar on the left, name + nickname + stats grid on the right.
// ─────────────────────────────────────────────────────────────────────────────
function playerCard(player) {
  const Stat = (label, value, color) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          border: `2px solid ${C.border}`,
          borderRadius: 16,
          padding: '14px 22px',
          minWidth: 130,
        },
      },
      h(
        'div',
        {
          style: {
            fontFamily: 'Nunito',
            fontSize: 14,
            fontWeight: 900,
            color: C.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 1,
          },
        },
        label
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Abril Fatface',
            fontSize: 44,
            color: color || C.textPrimary,
            lineHeight: 1.1,
          },
        },
        value
      )
    );

  const streakIsWin = (player.streak || '').startsWith('W');
  const streakDisplay = player.streak
    ? (streakIsWin ? '🔥 ' : '🧊 ') + player.streak
    : '—';

  // Rank badge — shows the player's position in 1v1 / 2v2 standings.
  // Each badge: medal emoji for top 3 (🥇🥈🥉), otherwise plain "#N" inside a pill.
  const RankBadge = (rank, type) => {
    const isPodium = rank && rank <= 3;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
    return h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 999,
          background: isPodium ? 'rgba(212,176,23,0.15)' : 'rgba(44,36,22,0.06)',
          border: `2px solid ${isPodium ? 'rgba(212,176,23,0.55)' : 'rgba(44,36,22,0.12)'}`,
          fontFamily: 'Nunito',
          fontSize: 18,
          fontWeight: 900,
          color: isPodium ? C.gold : C.textSecondary,
        },
      },
      medal
        ? h('span', { style: { fontSize: 20, display: 'flex' } }, medal)
        : h('span', null, `#${rank}`),
      h(
        'span',
        { style: { color: C.textPrimary, textTransform: 'uppercase', letterSpacing: 1 } },
        type
      )
    );
  };

  const hasRanks =
    (player.rank_1v1 != null && player.rank_1v1 > 0) ||
    (player.rank_2v2 != null && player.rank_2v2 > 0);

  return frame(
    h(
      'div',
      {
        style: { display: 'flex', flex: 1, alignItems: 'center', gap: 56 },
      },
      // Avatar
      h(
        'div',
        { style: { display: 'flex', flexShrink: 0 } },
        Avatar(player.display_name, 260, player.avatar_url || null)
      ),
      // Stats column
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 14 } },
        h(
          'div',
          {
            style: {
              fontFamily: 'Abril Fatface',
              fontSize: 72,
              color: C.textPrimary,
              lineHeight: 1,
            },
          },
          player.display_name
        ),
        player.nickname &&
          h(
            'div',
            {
              style: {
                fontFamily: 'Nunito',
                fontSize: 24,
                color: C.textSecondary,
                fontStyle: 'italic',
              },
            },
            `"${player.nickname}"`
          ),
        // Rank badges row
        hasRanks &&
          h(
            'div',
            { style: { display: 'flex', gap: 10, marginTop: 2, marginBottom: 4 } },
            player.rank_1v1 ? RankBadge(player.rank_1v1, '1v1') : null,
            player.rank_2v2 ? RankBadge(player.rank_2v2, '2v2') : null
          ),
        h(
          'div',
          { style: { display: 'flex', gap: 14, flexWrap: 'wrap' } },
          Stat('GP', String(player.gp)),
          Stat('W', String(player.wins), C.primary),
          Stat('L', String(player.losses), C.danger),
          Stat(
            '+/-',
            (player.plus_minus > 0 ? '+' : '') + String(player.plus_minus),
            player.plus_minus >= 0 ? C.primary : C.danger
          )
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 14 } },
          Stat('Win %', `${player.win_pct}%`, C.secondary),
          Stat('Streak', streakDisplay, streakIsWin ? C.primary : C.danger)
        )
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS CARD
// Layout: header (league + period), top 5 rows with rank, avatar, name, points.
// Top 3 get a subtle gold tint.
// ─────────────────────────────────────────────────────────────────────────────
function standingsCard({ league_name, period_label, rows }) {
  const top5 = rows.slice(0, 5);

  // Each cell is a fixed-width box (or flex-grow for the name col). Order
  // matches the in-app standings table: #, Name, GP, W, L, +/-, Win%, Streak, Pts.

  // Fixed-width cell helper (header label or data value).
  const Cell = (width, content, opts = {}) =>
    h(
      'div',
      {
        style: {
          width,
          display: 'flex',
          alignItems: 'center',
          justifyContent: opts.align === 'left' ? 'flex-start' : 'center',
          ...(opts.style || {}),
        },
      },
      content
    );

  // Flex-grow cell (for the name column).
  const FlexCell = (content, opts = {}) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          flexGrow: 1,
          gap: 12,
          ...(opts.style || {}),
        },
      },
      content
    );

  const headerStyle = {
    fontFamily: 'Nunito',
    fontSize: 13,
    fontWeight: 900,
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  };

  const Header = h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 22px 6px 22px',
      },
    },
    Cell(50, h('span', { style: headerStyle }, '#')),
    FlexCell(
      h('span', { style: { ...headerStyle, paddingLeft: 56 } }, 'Player')
    ),
    Cell(70, h('span', { style: headerStyle }, 'GP')),
    Cell(60, h('span', { style: headerStyle }, 'W')),
    Cell(60, h('span', { style: headerStyle }, 'L')),
    Cell(90, h('span', { style: headerStyle }, '+/-')),
    Cell(100, h('span', { style: headerStyle }, 'Win %')),
    Cell(90, h('span', { style: headerStyle }, 'Strk')),
    Cell(80, h('span', { style: headerStyle }, 'Pts'))
  );

  // Render a value cell with consistent typography.
  const numCell = (width, text, color, big) =>
    Cell(
      width,
      h(
        'span',
        {
          style: {
            fontFamily: big ? 'Abril Fatface' : 'Nunito',
            fontSize: big ? 32 : 22,
            fontWeight: big ? 400 : 700,
            color: color || C.textPrimary,
          },
        },
        text
      )
    );

  const Row = (r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
    const rankContent = medal
      ? h('span', { style: { fontSize: 28, display: 'flex' } }, medal)
      : h(
          'span',
          { style: { fontFamily: 'Abril Fatface', fontSize: 28, color: C.textSecondary } },
          String(i + 1)
        );
    const pm = r.plus_minus ?? 0;
    const pmColor = pm > 0 ? C.primary : pm < 0 ? C.danger : C.textPrimary;
    const streak = r.streak || '';
    const streakColor = streak.startsWith('W')
      ? C.primary
      : streak.startsWith('L')
        ? C.danger
        : C.textSecondary;

    return h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 22px',
          background: i < 3 ? 'rgba(212,176,23,0.12)' : C.surface,
          border: `2px solid ${i < 3 ? 'rgba(212,176,23,0.5)' : C.border}`,
          borderRadius: 12,
          marginBottom: 6,
          height: 64,
        },
      },
      Cell(50, rankContent),
      FlexCell([
        Avatar(r.display_name, 44, r.avatar_url || null),
        h(
          'span',
          {
            style: {
              fontFamily: 'Nunito',
              fontSize: 22,
              fontWeight: 900,
              color: C.textPrimary,
            },
          },
          r.display_name
        ),
      ]),
      numCell(70, String(r.gp ?? 0)),
      numCell(60, String(r.wins ?? 0), C.primary),
      numCell(60, String(r.losses ?? 0), C.danger),
      numCell(90, (pm > 0 ? '+' : '') + String(pm), pmColor),
      numCell(100, `${r.win_pct ?? 0}%`, C.secondary),
      numCell(90, streak || '—', streakColor),
      numCell(80, String(r.pts ?? 0), C.primary, true)
    );
  };

  return frame(
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 14,
          },
        },
        h(
          'div',
          {
            style: { fontFamily: 'Abril Fatface', fontSize: 46, color: C.textPrimary },
          },
          league_name || 'Cornhole249'
        ),
        h(
          'div',
          {
            style: {
              fontFamily: 'Nunito',
              fontSize: 20,
              fontWeight: 700,
              color: C.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: 1,
            },
          },
          period_label || 'Standings'
        )
      ),
      Header,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        ...top5.map((r, i) => Row(r, i))
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT OVERVIEW CARD
// Layout: header strip (name + status) + bracket visualisation. Each round is
// a flex column where match "slots" are equal-height; the actual match cell
// is centered inside its slot, so visual alignment reads as a bracket tree.
//
// Handles 4-team and 8-team single-elim brackets cleanly. For larger brackets
// (16+) we show only the latest two rounds + final, which is the most
// shareable content anyway.
// ─────────────────────────────────────────────────────────────────────────────
function tournamentOverviewCard(t) {
  const status = (t.status || 'in_progress').toLowerCase();
  const statusLabel =
    status === 'complete' ? 'Complete' : status === 'scheduled' ? 'Scheduled' : 'In Progress';
  const statusColor =
    status === 'complete' ? '#1E40AF' : status === 'scheduled' ? '#92400E' : '#065F46';
  const statusBg =
    status === 'complete' ? '#DBEAFE' : status === 'scheduled' ? '#FEF3C7' : '#D1FAE5';

  // Render one match cell — two team rows stacked, with score per team.
  // `won` highlights the winning side. `champion` swaps in a distinct
  // gold "trophy" treatment (no green-tint clash with gold border).
  const MatchCell = (match, { champion } = {}) => {
    if (!match) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            background: 'rgba(44,36,22,0.04)',
            border: `2px dashed rgba(44,36,22,0.18)`,
            borderRadius: 10,
            margin: '4px 0',
            height: 60,
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Nunito',
            fontSize: 14,
            fontWeight: 700,
            color: C.textSecondary,
            opacity: 0.7,
          },
        },
        'TBD'
      );
    }

    // Champion treatment: gold cell, trophy emoji prefixed on the winner,
    // no internal green tint (which would muddy the gold).
    if (champion) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            background: '#FBEFB7', // soft gold
            border: `2px solid ${C.gold}`,
            borderRadius: 12,
            padding: 8,
            gap: 2,
            margin: '4px 0',
            boxShadow: '0 4px 14px rgba(212,176,23,0.25)',
          },
        },
        // Tiny "CHAMPION" caption
        h(
          'div',
          {
            style: {
              fontFamily: 'Nunito',
              fontSize: 11,
              fontWeight: 900,
              color: '#8A6F0B',
              textTransform: 'uppercase',
              letterSpacing: 1.4,
              padding: '0 6px',
              display: 'flex',
            },
          },
          '🏆 Champion'
        ),
        // Winner row — bold, gold-accented score
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              gap: 8,
            },
          },
          h(
            'div',
            {
              style: {
                fontFamily: 'Nunito',
                fontSize: 16,
                fontWeight: 900,
                color: C.textPrimary,
                flexGrow: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              },
            },
            match.team1.won ? match.team1.name : match.team2.name
          ),
          h(
            'div',
            {
              style: {
                fontFamily: 'Abril Fatface',
                fontSize: 24,
                color: '#8A6F0B',
              },
            },
            String(match.team1.won ? match.team1.score : match.team2.score)
          )
        ),
        // Runner-up row — muted
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 8px',
              gap: 8,
              opacity: 0.55,
            },
          },
          h(
            'div',
            {
              style: {
                fontFamily: 'Nunito',
                fontSize: 13,
                fontWeight: 700,
                color: C.textSecondary,
                flexGrow: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              },
            },
            match.team1.won ? match.team2.name : match.team1.name
          ),
          h(
            'div',
            {
              style: {
                fontFamily: 'Abril Fatface',
                fontSize: 18,
                color: C.textSecondary,
              },
            },
            String(match.team1.won ? match.team2.score : match.team1.score)
          )
        )
      );
    }

    // Regular non-champion match cell
    const TeamRow = (teamName, score, won) =>
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 12px',
            background: won ? 'rgba(58,107,53,0.10)' : 'transparent',
            borderRadius: 6,
            gap: 8,
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: 'Nunito',
              fontSize: 15,
              fontWeight: won ? 900 : 700,
              color: won ? C.textPrimary : C.textSecondary,
              flexGrow: 1,
              flexShrink: 1,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            },
          },
          teamName
        ),
        h(
          'div',
          {
            style: {
              fontFamily: 'Abril Fatface',
              fontSize: 22,
              color: won ? C.primary : C.textSecondary,
            },
          },
          score != null ? String(score) : '—'
        )
      );

    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          border: `2px solid ${C.border}`,
          borderRadius: 12,
          padding: 4,
          gap: 2,
        },
      },
      TeamRow(match.team1.name, match.team1.score, match.team1.won),
      TeamRow(match.team2.name, match.team2.score, match.team2.won)
    );
  };

  // Pad/round count by inferring from input: t.rounds is [Round1[], Round2[], ...]
  const rounds = t.rounds || [];

  // Slot — flex-grow wrapper that vertically centers its match cell.
  // All slots in a column share the same flexGrow so each round naturally
  // distributes its matches over the column height; matches in later rounds
  // (fewer per column) end up vertically aligned to the midpoint of their
  // upstream pairs.
  const SlotCol = (matches, { isFinal } = {}) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        },
      },
      ...matches.map((m) =>
        h(
          'div',
          {
            style: {
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '8px 0', // forces visible breathing room between adjacent matches
            },
          },
          MatchCell(m, { champion: isFinal && m && (m.team1.won || m.team2.won) })
        )
      )
    );

  const ROUND_LABELS = ['Round 1', 'Quarterfinals', 'Semifinals', 'Final'];
  const labelForRound = (numRounds, idx) => {
    // Walk backwards from Final
    const fromEnd = numRounds - 1 - idx;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2) return 'Quarterfinals';
    return `Round ${idx + 1}`;
  };

  const subline = `${t.format === 'double_elim' ? 'Double Elim' : 'Single Elim'} · ${t.teams_count || rounds[0]?.length * 2 || ''} teams`;

  return tournamentFrame(
    // Bracket area — round columns side by side
    h(
      'div',
      {
        style: {
          display: 'flex',
          flex: 1,
          gap: 18,
          alignItems: 'stretch',
        },
      },
      ...rounds.map((round, idx) =>
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1,
              gap: 0,
            },
          },
          h(
            'div',
            {
              style: {
                fontFamily: 'Nunito',
                fontSize: 12,
                fontWeight: 900,
                color: C.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 12,
                textAlign: 'center',
                display: 'flex',
                justifyContent: 'center',
                flexShrink: 0,
              },
            },
            labelForRound(rounds.length, idx)
          ),
          SlotCol(round, { isFinal: idx === rounds.length - 1 })
        )
      )
    ),
    tournamentRibbon({
      name: t.name,
      statusLabel,
      statusColor,
      statusBg,
      subline,
      gameType: t.game_type || '1v1',
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT MATCH CARD
// Layout: very similar to the game card, but the header shows the tournament
// name + round label instead of a date. For sharing a specific match result.
// ─────────────────────────────────────────────────────────────────────────────
function tournamentMatchCard(m) {
  const team1Won = m.t1Score > m.t2Score;

  // team is an array of {name, avatarUrl} objects
  const TeamCol = (team, score, won) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flex: 1,
          padding: 24,
          background: won ? 'rgba(58,107,53,0.10)' : 'rgba(44,36,22,0.03)',
          borderRadius: 24,
          border: won
            ? `3px solid ${C.primary}`
            : '2px solid rgba(44,36,22,0.10)',
          opacity: won ? 1 : 0.85,
        },
      },
      h(
        'div',
        { style: { display: 'flex', gap: -12, marginBottom: 14 } },
        ...team.map((p, i) =>
          h(
            'div',
            { style: { marginLeft: i > 0 ? -16 : 0, display: 'flex' } },
            Avatar(p.name, 72, p.avatarUrl)
          )
        )
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Nunito',
            fontSize: 22,
            fontWeight: 700,
            color: C.textPrimary,
            textAlign: 'center',
            marginBottom: 6,
          },
        },
        team.map((p) => p.name).join(' & ')
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Abril Fatface',
            fontSize: 104,
            lineHeight: 1,
            color: won ? C.primary : C.textSecondary,
          },
        },
        String(score)
      ),
      won &&
        h('div', { style: { fontSize: 34, marginTop: 2, display: 'flex' } }, '🏆')
    );

  return tournamentFrame(
    h(
      'div',
      { style: { display: 'flex', flex: 1, alignItems: 'center', gap: 16 } },
      TeamCol(m.team1, m.t1Score, team1Won),
      h(
        'div',
        {
          style: {
            fontFamily: 'Abril Fatface',
            fontSize: 52,
            color: C.textSecondary,
            opacity: 0.45,
          },
        },
        'VS'
      ),
      TeamCol(m.team2, m.t2Score, !team1Won)
    ),
    tournamentRibbon({
      name: m.tournament_name,
      statusLabel: m.round_label || 'Match',
      statusColor: '#8A6F0B',
      statusBg: '#FBEFB7',
      subline: 'Tournament match',
      gameType: m.game_type || '1v1',
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK CARD
// Renders when an OG endpoint can't find the entity (deleted game, etc.).
// ─────────────────────────────────────────────────────────────────────────────
function fallbackCard() {
  return frame(
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        },
      },
      h(
        'div',
        { style: { fontSize: 96, marginBottom: 12, display: 'flex' } },
        '🫥'
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Abril Fatface',
            fontSize: 80,
            color: C.textPrimary,
            lineHeight: 1.05,
            marginBottom: 16,
          },
        },
        "Couldn't find that."
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Nunito',
            fontSize: 32,
            color: C.textSecondary,
            maxWidth: 800,
            lineHeight: 1.3,
          },
        },
        'But Cornhole249 is still here — make a league for your crew.'
      )
    ),
    { footerCaption: 'cornhole249.com — start a league' }
  );
}

module.exports = {
  gameCard,
  playerCard,
  standingsCard,
  tournamentOverviewCard,
  tournamentMatchCard,
  fallbackCard,
  C,
};
