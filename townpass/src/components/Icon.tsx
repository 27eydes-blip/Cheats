/**
 * One consistent line-icon set (24px grid, 1.75 stroke, currentColor) used across
 * the site instead of emoji, so icons look the same on every phone.
 */

export const ICONS: Record<string, string> = {
  logo: '<circle cx="12" cy="12" r="9.5"/><path d="M12 4.5l2.2 6.5h-4.4z" fill="currentColor" stroke="none"/><path d="M5 15.5c1.6-1.4 3-1.4 4.6 0s3 1.4 4.6 0 3-1.4 4.6 0"/>',
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
  essentials: '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  food: '<path d="M6 3v6.5a3 3 0 0 0 6 0V3"/><path d="M9 3v18"/><path d="M18 21V3c-2.2.8-3.5 3-3.5 6v4.5H18"/>',
  nightlife: '<path d="M4.5 4h15L12 12.5z"/><path d="M12 12.5V20"/><path d="M8 20h8"/>',
  beaches: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7.5"/><path d="M8 21h8"/>',
  parking: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  tips: '<path d="M9.5 18h5"/><path d="M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.6.6.8 1.4.8 2.4h6c0-1 .2-1.8.8-2.4A6 6 0 0 0 12 3z"/>',
  phone: '<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  directions: '<path d="M4 11.5 20 4l-7.5 16-1.8-6.7z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  back: '<path d="m14.5 18-6-6 6-6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  pin: '<path d="M12 21s6.5-5.8 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 15.2 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/>',
  rate: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.2c-.4-1-1.4-1.7-2.6-1.7-1.6 0-2.7.9-2.7 2.1 0 2.9 5.5 1.6 5.5 4.6 0 1.2-1.2 2.2-2.8 2.2-1.3 0-2.4-.7-2.8-1.8M12 6v1.5M12 16.5V18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  flag: '<path d="M5.5 21V4h11l-2 4 2 4h-11"/>',
  // weather
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  "sun-cloud": '<path d="M7.5 7.8A3.5 3.5 0 0 1 13.4 5"/><path d="M7 2.5v1.2M2.8 7H4M3.9 3.9l.9.9"/><path d="M8 20h9a3.8 3.8 0 0 0 .5-7.6 5.2 5.2 0 0 0-9.9 1.3A3.2 3.2 0 0 0 8 20z"/>',
  cloud: '<path d="M7 19h10a4.2 4.2 0 0 0 .5-8.4 6 6 0 0 0-11.4 1.6A3.5 3.5 0 0 0 7 19z"/>',
  fog: '<path d="M4 8.5h16M3 12.5h18M5 16.5h14M8 20.5h8"/>',
  rain: '<path d="M7 14.5h10a4.2 4.2 0 0 0 .5-8.4A6 6 0 0 0 6.1 7.7 3.5 3.5 0 0 0 7 14.5z"/><path d="m8.5 17.5-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
  storm: '<path d="M7 14.5h10a4.2 4.2 0 0 0 .5-8.4A6 6 0 0 0 6.1 7.7 3.5 3.5 0 0 0 7 14.5z"/><path d="m12.5 14.5-2 3.5h3l-2 3.5"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
};

/** Map the weather glyphs stored with forecasts to icon names. */
const WEATHER: Record<string, string> = {
  "☀️": "sun", "🌙": "moon", "🌤️": "sun-cloud", "⛅": "sun-cloud", "☁️": "cloud", "🌫️": "fog",
  "🌦️": "rain", "🌧️": "rain", "❄️": "snow", "🌨️": "snow", "⛈️": "storm",
};
export const weatherIcon = (glyph: string) => WEATHER[glyph] ?? "cloud";

export function Icon({ name, className = "size-5", strokeWidth = 1.75 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.tips }}
    />
  );
}
