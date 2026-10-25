// 24px stroke icons, currentColor. <Icon name="sleep" size={20} />
const P = {
  today: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  trends: <><path d="M3 17l6-6 4 4 8-9" /><path d="M15 6h6v6" /></>,
  sleep: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  reports: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 17v-4M12 17V8M16 17v-6" /></>,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4" /><path d="M5.5 3v4h4M18.5 21v-4h-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" /></>,
  insights: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  heart: <path d="M12 20s-7-4.4-9-9.2C1.8 7.6 3.700 4.500 7 4.500c2 0 3.400 1 5 3 1.600-2 3-3 5-3 3.300 0 5.200 3.100 4 6.300-2 4.800-9 9.200-9 9.200Z" />,
  battery: <><rect x="2" y="8" width="17" height="9" rx="2.500" /><path d="M22 11v3M6 11.500v2M10 11.500v2" /></>,
  stress: <path d="M13 3 5 13.500h6L10 21l8-10.500h-6L13 3Z" />,
  steps: <><path d="M8 20c-2 0-3-1.300-3-3 0-2.500 1.500-4 2.500-6s.500-4 2.500-4 2.500 2 2 4-1.500 3.500-1.500 5.500c0 1.500-1 3.500-2.500 3.500Z" /><path d="M16 15c1.500 0 3-1 3-3 0-1.500-.800-2.500-1-4s-.800-3-2.300-3S13 6 13.500 7.500" /></>,
  flame: <path d="M12 21c-4 0-7-2.700-7-6.500 0-2.800 1.800-4.700 3-6 .5 1.500 1.200 2.200 2 2.500C10 8 11 5 13 3c.4 3 4 5 5 8.500.3 1 .2 2.200 0 3-.8 3.700-3 6.500-6 6.500Z" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-down': <path d="m5 9 7 7 7-7" />,
  check: <path d="m4.500 12.500 5 5L20 6.500" />,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4.500M12 17.500v.01" /></>,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  download: <><path d="M12 4v11M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  upload: <><path d="M12 16V5M7 9l5-5 5 5" /><path d="M5 20h14" /></>,
  lock: <><rect x="5" y="10.500" width="14" height="10" rx="2.500" /><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800" /></>,
  moon: <path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500Z" />,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.400 0 2-.900 2-1.800 0-1.300-1.200-1.500-1.200-2.800 0-1 .800-1.600 1.800-1.600H17a4 4 0 0 0 4-4C21 6.200 17 3 12 3Z" /><circle cx="7.500" cy="11.500" r="1" /><circle cx="10" cy="7.500" r="1" /><circle cx="15" cy="7.500" r="1" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.500-5.800" /><path d="M20 4v5h-5" /></>,
  'arrow-up': <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  'arrow-down': <><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></>,
  minus: <path d="M6 12h12" />,
  link: <><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1-1" /></>,
  share: <><path d="M12 15V3M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>,
}

export default function Icon({ name, size = 22, strokeWidth = 1.8, className, ...rest }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{P[name] || P.activity}</svg>
}
