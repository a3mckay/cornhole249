const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const WMO_CONDITIONS = {
  0: 'Clear',
  1: 'Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Snow',
  77: 'Snow',
  80: 'Rain',
  81: 'Rain',
  82: 'Heavy Rain',
  85: 'Snow',
  86: 'Snow',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

function mapWmoToCondition(code) {
  if (code === null || code === undefined) return 'Unknown';
  const c = parseInt(code);
  if (c <= 1) return 'Clear';
  if (c === 2) return 'Partly Cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 55) return 'Drizzle';
  if (c >= 61 && c <= 63) return 'Rain';
  if (c >= 64 && c <= 67) return 'Heavy Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Rain';
  if (c >= 85 && c <= 86) return 'Snow';
  if (c >= 95 && c <= 99) return 'Thunderstorm';
  return WMO_CONDITIONS[c] || 'Unknown';
}

async function fetchWeatherForGame(lat, lng, dateStr) {
  if (!lat || !lng) return null;
  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) return null;

  // Use HOURLY data and pick the hour closest to the game's actual played_at
  // time. Daily aggregates (mean temp, sum precip, day's predominant weather
  // code) are misleading: a day with morning rain and a warm dry evening
  // shows up as "14°C with Rain" even when game time was 22°C and clear.
  const variables = 'temperature_2m,precipitation,wind_speed_10m,weather_code';
  // 3-day window centred on the game date so games near midnight UTC always
  // have the closest hour available regardless of which calendar day it falls in.
  const startDate = new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Try forecast API first (covers past 92 days and future, fast), then fall
  // back to archive API (uses ERA5 reanalysis, covers all historical dates
  // but lags ~5 days behind real-time).
  const candidateUrls = [
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&hourly=${variables}&timezone=GMT&past_days=92`,
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&hourly=${variables}&timezone=GMT`,
  ];

  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url, { timeout: 8000 });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.hourly || !Array.isArray(data.hourly.time) || !data.hourly.time.length) continue;
      if (!Array.isArray(data.hourly.weather_code)) continue;

      // Find the hour closest to game time (UTC). With timezone=GMT, hourly
      // time strings are UTC ISO without the trailing Z, e.g. "2026-05-04T20:00".
      const gameTime = date.getTime();
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < data.hourly.time.length; i++) {
        const hourTime = Date.parse(data.hourly.time[i] + 'Z');
        if (isNaN(hourTime)) continue;
        const diff = Math.abs(gameTime - hourTime);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      if (bestIdx === -1) continue;

      const code = data.hourly.weather_code[bestIdx];
      const temp = data.hourly.temperature_2m?.[bestIdx];
      const wind = data.hourly.wind_speed_10m?.[bestIdx];
      const precip = data.hourly.precipitation?.[bestIdx];
      if (code === null || code === undefined) continue;
      if (temp === null || temp === undefined) continue;

      return {
        condition: mapWmoToCondition(code),
        weather_code: code,
        temp_c: Math.round(temp * 10) / 10,
        wind_kph: wind != null ? Math.round(wind * 10) / 10 : null,
        precipitation_mm: precip != null ? Math.round(precip * 10) / 10 : 0,
      };
    } catch (e) {
      console.warn('[Weather] Fetch attempt failed:', e.message);
    }
  }
  return null;
}

// GET /api/weather?lat=&lng=&date=
router.get('/', async (req, res) => {
  const { lat, lng, date } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const result = await fetchWeatherForGame(parseFloat(lat), parseFloat(lng), date);
  if (!result) return res.status(503).json({ error: 'Weather data unavailable' });
  res.json(result);
});

module.exports = router;
module.exports.fetchWeatherForGame = fetchWeatherForGame;
module.exports.mapWmoToCondition = mapWmoToCondition;
