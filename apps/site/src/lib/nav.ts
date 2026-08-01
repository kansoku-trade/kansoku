export interface NavLink {
  key: string;
  href: string;
  label: string;
  external?: boolean;
}

// Rendered by both headers (Base's .nav-links and the landing topbar's .chrome-nav) so each
// link keeps one `nav-<key>` view-transition name and slides between the two on navigation.
export const NAV_LINKS: NavLink[] = [
  { key: 'pricing', href: '/pricing', label: '定价' },
  { key: 'changelog', href: '/changelog', label: '更新日志' },
  { key: 'docs', href: '/docs', label: '文档' },
  {
    key: 'github',
    href: 'https://github.com/kansoku-trade/kansoku',
    label: 'GitHub',
    external: true,
  },
];
