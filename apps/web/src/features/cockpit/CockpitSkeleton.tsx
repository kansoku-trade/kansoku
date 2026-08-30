import { ArrowLeft } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { colors, fontSizes, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  fullpage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  fullpageDesktop: {
    height: 'calc(100vh - 40px)',
  },
  detailBody: {
    flex: 1,
    minHeight: 0,
  },
  detailTopbar: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    fontSize: fontSizes.md,
    gap: '12px',
    padding: '8px 14px',
  },
  detailTopbarSplit: {
    display: 'grid',
    gap: 0,
    gridTemplateColumns: `1fr ${sizes.sidebarWidth}`,
    padding: 0,
  },
  topbarColumn: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
    minWidth: 0,
    padding: '8px 14px',
  },
  topbarChart: {
    borderRightColor: colors.border,
    borderRightStyle: 'solid',
    borderRightWidth: '1px',
  },
  topbarSide: {
    gap: '8px',
  },
  icon: {
    verticalAlign: '-2px',
  },
  backLink: {
    color: {
      'default': colors.textPrimary,
      ':hover': colors.accent,
    },
    textDecoration: 'none',
  },
  bone: {
    animationName: 'none',
    backgroundColor: colors.backgroundElement,
    backgroundImage: 'none',
  },
  meta: {
    height: '12px',
    width: '56px',
  },
  timeframe: {
    height: '22px',
    width: '36px',
  },
  quote: {
    height: '14px',
    width: '130px',
  },
  controls: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '8px',
  },
  mainChart: {
    flex: '1 1 auto',
    minHeight: 0,
    padding: '12px',
  },
  macdChart: {
    flex: '0 0 190px',
    padding: '12px',
  },
  chart: {
    height: '100%',
    width: '100%',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: `1fr ${sizes.sidebarWidth}`,
    height: '100%',
    position: 'relative',
  },
  chartsCol: {
    borderRightColor: colors.border,
    borderRightStyle: 'solid',
    borderRightWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebar: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    fontSize: fontSizes.md,
    overflow: 'hidden',
  },
  tabbar: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '8px',
    padding: '10px 16px',
  },
  sidebarScroll: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '12px',
    minHeight: 0,
    overflowY: 'auto',
    padding: 16,
  },
  line: {
    height: '12px',
    width: '100%',
  },
  lineWidth80: {
    height: '12px',
    width: '80%',
  },
  lineWidth60: {
    height: '12px',
    width: '60%',
  },
  lineWidth40: {
    height: '12px',
    width: '40%',
  },
  block: {
    height: '72px',
    width: '100%',
  },
  tab: {
    height: '20px',
    width: '48px',
  },
});

function Bone({ style }: { style: stylex.StyleXStyles }) {
  return (
    <div
      className={[stylex.props(styles.bone, style).className, 'app-skeleton-bone']
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export function CockpitSkeleton() {
  const desktopShell = isDesktopRealtime();

  return (
    <div
      className={`fullpage ${stylex.props(styles.fullpage, desktopShell && styles.fullpageDesktop).className}`}
      aria-busy="true"
      aria-label="加载中"
    >
      <div
        className={`detail-topbar detail-topbar--split ${stylex.props(styles.detailTopbar, styles.detailTopbarSplit).className}`}
      >
        <div
          className={`topbar-chart ${stylex.props(styles.topbarColumn, styles.topbarChart).className}`}
        >
          <a {...stylex.props(styles.backLink)} href="/">
            <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} /> 列表
          </a>
          <Bone style={styles.meta} />
          <span {...stylex.props(styles.controls)} aria-hidden="true">
            <Bone style={styles.timeframe} />
            <Bone style={styles.timeframe} />
            <Bone style={styles.timeframe} />
          </span>
        </div>
        <div
          className={`topbar-side ${stylex.props(styles.topbarColumn, styles.topbarSide).className}`}
          aria-hidden="true"
        >
          <Bone style={styles.quote} />
        </div>
      </div>
      <div className={`detail-body ${stylex.props(styles.detailBody).className}`}>
        <div className={`layout ${stylex.props(styles.layout).className}`} aria-hidden="true">
          <div className={`charts-col ${stylex.props(styles.chartsCol).className}`}>
            <div className="chart-block" {...stylex.props(styles.mainChart)}>
              <Bone style={styles.chart} />
            </div>
            <div className="chart-block" {...stylex.props(styles.macdChart)}>
              <Bone style={styles.chart} />
            </div>
          </div>
          <div className={`sidebar ${stylex.props(styles.sidebar).className}`}>
            <div {...stylex.props(styles.tabbar)}>
              <Bone style={styles.tab} />
              <Bone style={styles.tab} />
              <Bone style={styles.tab} />
              <Bone style={styles.tab} />
            </div>
            <div className="sidebar-scroll" {...stylex.props(styles.sidebarScroll)}>
              <Bone style={styles.lineWidth60} />
              <Bone style={styles.block} />
              <Bone style={styles.line} />
              <Bone style={styles.lineWidth80} />
              <Bone style={styles.lineWidth60} />
              <Bone style={styles.block} />
              <Bone style={styles.lineWidth80} />
              <Bone style={styles.lineWidth40} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
