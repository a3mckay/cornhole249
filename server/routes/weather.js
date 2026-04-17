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
  if (c <= 3) return 'Partly Cloudy';
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
  const dateOnly = date.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  const isPast = dateOnly < today;

  let url;
  if (isPast) {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateOnly}&end_date=${dateOnly}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max,weathercode&timezone=auto`;
  } else {
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&start_date=${dateOnly}&end_date=${dateOnly}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max,weathercode&timezone=auto`;
  }

  try {
    const resp = await fetch(url, { timeout: 8000 });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.daily || !data.daily.weathercode || !data.daily.weathercode[0]) return null;

    const code = data.daily.weathercode[0];
    return {
      condition: mapWmoToCondition(code),
      weather_code: code,
      temp_c: data.daily.temperature_2m_max[0],
      wind_kph: data.daily.windspeed_10m_max[0],
      precipitation_mm: data.daily.precipitation_sum[0],
    };
  } catch (e) {
    console.warn('[Weather] Fetch failed:', e.message);
    return null;
  }
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
