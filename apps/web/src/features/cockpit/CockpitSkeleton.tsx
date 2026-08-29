import { ArrowLeft } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../../theme/tokens.stylex';

const styles = stylex.create({
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
    flexDirection: 'column',
    gap: '12px',
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
  return (
    <div className="fullpage" aria-busy="true" aria-label="加载中">
      <div className="detail-topbar detail-topbar--split">
        <div className="topbar-chart">
          <a href="/">
            <ArrowLeft className="icon" size={13} /> 列表
          </a>
          <Bone style={styles.meta} />
          <span {...stylex.props(styles.controls)} aria-hidden="true">
            <Bone style={styles.timeframe} />
            <Bone style={styles.timeframe} />
            <Bone style={styles.timeframe} />
          </span>
        </div>
        <div className="topbar-side" aria-hidden="true">
          <Bone style={styles.quote} />
        </div>
      </div>
      <div className="detail-body">
        <div className="layout" aria-hidden="true">
          <div className="charts-col">
            <div className="chart-block" {...stylex.props(styles.mainChart)}>
              <Bone style={styles.chart} />
            </div>
            <div className="chart-block" {...stylex.props(styles.macdChart)}>
              <Bone style={styles.chart} />
            </div>
          </div>
          <div className="sidebar">
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
