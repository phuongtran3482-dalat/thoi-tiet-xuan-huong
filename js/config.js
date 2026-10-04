/**
 * Cấu hình dùng chung cho trang web và Service Worker.
 * Muốn theo dõi địa điểm khác: chỉ cần đổi latitude/longitude/tên.
 */
(function (root) {
  'use strict';

  const CONFIG = {
    placeName: 'Phường Xuân Hương - Đà Lạt',
    shortName: 'Xuân Hương · Đà Lạt',
    region: 'Lâm Đồng, Việt Nam',
    // Tâm khu vực hồ Xuân Hương
    latitude: 11.9422,
    longitude: 108.4469,
    elevation: '≈1.500 m',
    timezone: 'Asia/Ho_Chi_Minh',
    pastDays: 92, // tối đa của Open-Meteo Forecast API
    forecastDays: 14,
    refreshMinutes: 30, // tự động làm mới trong ngày
    dailyRefreshAt: { hour: 0, minute: 5 }, // cập nhật đầu ngày (giờ Việt Nam)
  };

  const CURRENT = [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
    'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  ];

  const HOURLY = [
    'temperature_2m', 'relative_humidity_2m', 'precipitation_probability',
    'precipitation', 'weather_code', 'wind_speed_10m', 'uv_index', 'visibility', 'is_day',
  ];

  const DAILY = [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset',
    'daylight_duration', 'uv_index_max', 'precipitation_sum', 'precipitation_hours',
    'precipitation_probability_max', 'wind_speed_10m_max', 'wind_gusts_10m_max',
    'wind_direction_10m_dominant',
  ];

  const qs = (params) => new URLSearchParams(params).toString();

  function forecastUrl() {
    return 'https://api.open-meteo.com/v1/forecast?' + qs({
      latitude: CONFIG.latitude,
      longitude: CONFIG.longitude,
      timezone: CONFIG.timezone,
      past_days: CONFIG.pastDays,
      forecast_days: CONFIG.forecastDays,
      current: CURRENT.join(','),
      hourly: HOURLY.join(','),
      daily: DAILY.join(','),
    });
  }

  function airQualityUrl() {
    return 'https://air-quality-api.open-meteo.com/v1/air-quality?' + qs({
      latitude: CONFIG.latitude,
      longitude: CONFIG.longitude,
      timezone: CONFIG.timezone,
      current: 'us_aqi,pm2_5,pm10',
    });
  }

  root.WEATHER_CONFIG = CONFIG;
  root.WeatherApi = { forecastUrl, airQualityUrl };
})(typeof self !== 'undefined' ? self : globalThis);
