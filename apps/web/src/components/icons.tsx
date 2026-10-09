import type { ReactNode } from 'react';

/** Small inline SVG icons (stroke = currentColor). Decorative: always paired with text. */
const svg = (children: ReactNode, viewBox = '0 0 24 24') => (
  <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);

export const IconCheck = () => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconWarn = () => svg(<><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v5M12 17.8v.2" /></>);
export const IconAlert = () => svg(<><circle cx="12" cy="12" r="9.5" /><path d="M12 7v6M12 16.2v.2" /></>);
export const IconDot = () => svg(<circle cx="12" cy="12" r="4" fill="currentColor" />);
export const IconUp = () => svg(<path d="M12 19V6M6 11.5l6-6 6 6" />);
export const IconDown = () => svg(<path d="M12 5v13M6 12.5l6 6 6-6" />);
export const IconFlat = () => svg(<path d="M5 12h14" />);
export const IconSun = () => svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8" /></>);
export const IconMoon = () => svg(<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />);
export const IconAuto = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 010 18z" fill="currentColor" /></>);
export const IconWave = () => svg(<path d="M3 12c2.2-6 4-6 6 0s3.8 6 6 0 3.8-6 6 0" />);
export const IconCalendar = () => svg(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
export const IconImport = () => svg(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 19h16" /></>);
export const IconChevronLeft = () => svg(<path d="M14.5 5.5L8 12l6.5 6.5" />);
export const IconChevronRight = () => svg(<path d="M9.5 5.5L16 12l-6.5 6.5" />);
