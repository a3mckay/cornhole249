import React from 'react';

const WEATHER_CONFIG = {
  'Clear':        { icon: '☀️', className: 'weather-clear' },
  'Partly Cloudy':{ icon: '⛅', className: 'weather-cloudy' },
  'Overcast':     { icon: '☁️', className: 'weather-cloudy' },
  'Fog':          { icon: '🌫️', className: 'weather-fog' },
  'Drizzle':      { icon: '🌦️', className: 'weather-rain' },
  'Rain':         { icon: '🌧️', className: 'weather-rain' },
  'Heavy Rain':   { icon: '⛈️', className: 'weather-rain' },
  'Snow':         { icon: '❄️', className: 'weather-snow' },
  'Thunderstorm': { icon: '⛈️', className: 'weather-thunder' },
  'Unknown':      { icon: '🌡️', className: 'weather-cloudy' },
};

export default function WeatherBadge({ weather, size = 'sm' }) {
  if (!weather) return null;

  const condition = weather.condition || 'Unknown';
  const config = WEATHER_CONFIG[condition] || WEATHER_CONFIG['Unknown'];

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-ui font-semibold ${config.className}`}>
        {config.icon} {condition}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-card ${config.className}`}>
      <span className="text-3xl">{config.icon}</span>
      <div>
        <div className="font-ui font-bold text-base">{condition}</div>
        {weather.temp_c !== undefined && (
          <div className="text-sm opacity-80">
            {Math.round(weather.temp_c)}°C
            {weather.wind_kph !== undefined && ` · ${Math.round(weather.wind_kph)} km/h wind`}
            {weather.precipitation_mm > 0 && ` · ${weather.precipitation_mm}mm rain`}
          </div>
        )}
      </div>
    </div>
  );
}
