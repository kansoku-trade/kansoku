import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from './theme/tokens.stylex';

const shimmer = stylex.keyframes({
  from: { backgroundPosition: '100% 0' },
  to: { backgroundPosition: '-100% 0' },
});

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundCanvas,
    color: colors.textPrimary,
    minHeight: '100vh',
  },
  desktop: {
    paddingTop: '40px',
  },
  page: {
    margin: '0 auto',
    'maxWidth': '1400px',
    'padding': '24px 20px 60px',
    'paddingBottom': '20px',
    '@media (max-width: 1000px)': {
      paddingBottom: '60px',
    },
  },
  pageSideContent: {
    'paddingRight': '8px',
    '@media (max-width: 1000px)': {
      paddingRight: 0,
    },
  },
  titlebar: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '8px',
    height: '40px',
    left: 0,
    position: 'fixed',
    right: 0,
    top: 0,
    WebkitAppRegion: 'drag',
    zIndex: 80,
  },
  traffic: {
    flex: '0 0 78px',
  },
  tabstrip: {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    height: '100%',
    minWidth: 0,
    paddingLeft: '4px',
  },
  topStrip: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundSurface,
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'display': 'grid',
    'fontVariantNumeric': 'tabular-nums',
    'gap': '20px',
    'gridTemplateColumns': 'auto 1fr auto',
    'margin': '4px 0 12px',
    'padding': '6px 12px',
    '@media (max-width: 900px)': {
      gap: '8px',
      gridTemplateColumns: '1fr',
    },
  },
  topStripId: {
    alignItems: 'baseline',
    display: 'inline-flex',
    gap: '10px',
    minWidth: 0,
  },
  topStripHeading: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: 700,
    letterSpacing: '0.01em',
    margin: 0,
  },
  topStripCluster: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '14px',
    minWidth: 0,
  },
  marketTemp: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    gap: '8px',
  },
  quickbar: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    margin: '4px 0 20px',
  },
  quickbarActions: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '8px',
    marginLeft: 'auto',
  },
  timeline: {
    height: '49px',
    margin: '8px 0 12px',
    overflowX: 'auto',
    scrollbarWidth: 'thin',
  },
  timelineTrack: {
    'boxSizing': 'border-box',
    'display': 'inline-flex',
    'minWidth': '100%',
    'padding': '2px 8px',
    'position': 'relative',
    '::before': {
      backgroundColor: colors.borderStrong,
      content: '""',
      height: '1px',
      left: '8px',
      position: 'absolute',
      right: '8px',
      top: '24px',
    },
  },
  timelineItem: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    cursor: 'default',
    display: 'flex',
    flex: 'none',
    flexDirection: 'column',
    fontFamily: fonts.ui,
    padding: 0,
    position: 'relative',
    width: '48px',
  },
  timelineMonth: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    height: '14px',
    lineHeight: '14px',
    paddingLeft: '2px',
    whiteSpace: 'nowrap',
  },
  timelineDot: {
    backgroundColor: colors.backgroundCanvas,
    borderColor: colors.borderStrong,
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: '1px',
    boxSizing: 'border-box',
    height: '7px',
    margin: '5px 0 4px',
    position: 'relative',
    width: '7px',
    zIndex: 1,
  },
  timelineDay: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  homeGrid: {
    'alignItems': 'start',
    'display': 'grid',
    'gap': '24px',
    'gridTemplateColumns': '2fr 1fr',
    '@media (max-width: 1000px)': {
      gridTemplateColumns: '1fr',
    },
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '12px',
    marginTop: '12px',
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: 500,
    letterSpacing: '0.08em',
    marginBottom: '8px',
    marginTop: '16px',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    padding: '12px',
  },
  symbolCard: {
    boxSizing: 'border-box',
    height: '70px',
    pointerEvents: 'none',
  },
  symbolHead: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  symbolLevels: {
    display: 'flex',
    gap: '14px',
    marginTop: '8px',
  },
  watchTail: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '10px',
  },
  watchTailCell: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'inline-flex',
    fontFamily: fonts.mono,
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gap: '7px',
    padding: '4px 10px',
  },
  panoramaTabs: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px',
  },
  panoramaRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  panoramaRow: {
    'display': 'grid',
    'gap': '6px',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  panoramaSector: {
    aspectRatio: '1 / 1',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: 0,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  panoramaChips: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'nowrap',
    gap: '4px',
    height: '24px',
    marginTop: '6px',
  },
  sectorRead: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '6px',
  },
  positions: {
    pointerEvents: 'none',
    padding: '10px 12px',
  },
  positionsSummary: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexWrap: 'wrap',
    fontFamily: fonts.mono,
    fontSize: fontSizes.md,
    fontVariantNumeric: 'tabular-nums',
    gap: '12px',
    paddingBottom: '8px',
  },
  positionsList: {
    alignItems: 'baseline',
    color: colors.textSecondary,
    columnGap: '12px',
    display: 'grid',
    fontFamily: fonts.mono,
    fontSize: fontSizes.md,
    fontVariantNumeric: 'tabular-nums',
    gridTemplateColumns: 'max-content 1fr max-content max-content',
    paddingTop: '7px',
    rowGap: '7px',
  },
  positionsRow: {
    display: 'contents',
  },
  eventCalendar: {
    color: colors.textMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  calendarNav: {
    alignItems: 'center',
    display: 'flex',
    gap: '6px',
    justifyContent: 'space-between',
    paddingBottom: '2px',
  },
  calendarWeekdays: {
    color: colors.textMuted,
    display: 'grid',
    fontSize: fontSizes.xs,
    gap: '1px',
    gridTemplateColumns: 'repeat(7, 1fr)',
    height: '16px',
    paddingBottom: '2px',
    textAlign: 'center',
  },
  calendarGrid: {
    display: 'grid',
    gap: '1px',
    gridTemplateColumns: 'repeat(7, 1fr)',
  },
  calendarDay: {
    aspectRatio: '1 / 1',
    backgroundColor: colors.backgroundSurface,
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderWidth: '1px',
    boxSizing: 'border-box',
    cursor: 'default',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '30px',
    padding: '3px 4px 2px',
    position: 'relative',
  },
  eventStrip: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
    paddingTop: '8px',
  },
  bone: {
    'animationDuration': '1.5s',
    'animationIterationCount': 'infinite',
    'animationName': shimmer,
    'animationTimingFunction': 'ease-in-out',
    'backgroundImage': `linear-gradient(90deg, ${colors.backgroundElement} 0%, ${colors.backgroundHover} 45%, ${colors.backgroundElement} 90%)`,
    'backgroundSize': '200% 100%',
    'borderRadius': radii.default,
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      backgroundColor: colors.backgroundElement,
      backgroundImage: 'none',
    },
  },
  tabBone: { height: '18px', width: '96px' },
  inputBone: { height: '28px', width: '170px' },
  chipBone: { height: '24px', width: '56px' },
  actionBone: { height: '16px', margin: '5px', width: '16px' },
  sessionBone: { height: '16px', width: '34px' },
  htsDateBone: { height: '11px', width: '72px' },
  indexBone: { height: '16px', width: '92px' },
  temp: { width: '207px' },
  tempLabelBone: { height: '11px', width: '48px' },
  tempGaugeBone: { height: '7px', width: '64px' },
  tempSubBone: { height: '11px', width: '79px' },
  timelineDayBone: { height: '11px', width: '12px' },
  symbolBone: { height: '16px', width: '64px' },
  badgeBone: { height: '16px', width: '40px' },
  quoteBone: { height: '14px', marginLeft: 'auto', width: '88px' },
  levelBone: { height: '17px', width: '72px' },
  tailCell: { boxSizing: 'border-box', height: '27.5px', width: '145px' },
  panoramaTabBone: { height: '24px', width: '82px' },
  panoramaSectorBone: { borderRadius: 0 },
  panoramaChipBone: { height: '24px', width: '108px' },
  sectorReadBone: { height: '16px', width: '180px' },
  statBone: { height: '18px', width: '88px' },
  positionSymbolBone: { height: '18px', width: '58px' },
  positionDetailBone: { height: '18px', width: '96px' },
  positionLastBone: { height: '18px', width: '52px' },
  positionPctBone: { height: '18px', width: '54px' },
  calendarButtonBone: { height: '22px', width: '22px' },
  calendarTitleBone: { height: '17px', width: '88px' },
  weekdayBone: { height: '11px', margin: '0 auto', width: '10px' },
  calendarDayBone: { height: '11px', width: '14px' },
  eventLabelBone: { height: '16px', width: '96px' },
  eventRowBone: { height: '44px', width: '100%' },
});

function classNames(hook: string, ...styleValues: stylex.StyleXStyles[]): string {
  return clsx(hook, stylex.props(...styleValues).className);
}

function isElectronShell(): boolean {
  return typeof navigator !== 'undefined' && /\bElectron\b/.test(navigator.userAgent);
}

function Bone({ className = '', style }: { className?: string; style?: stylex.StyleXStyles }) {
  return (
    <div
      className={clsx(classNames('', styles.bone, style), 'app-skeleton-bone', className)}
    />
  );
}

const INDEX_BONES = ['spy', 'qqq', 'dji', 'vix'];
const SHORTCUT_BONES = ['one', 'two', 'three', 'four', 'five'];
const TIMELINE_BONES = Array.from({ length: 10 }, (_, i) => i + 1);
const TAIL_BONES = Array.from({ length: 16 }, (_, i) => i + 1);
const POSITION_ROWS = Array.from({ length: 5 }, (_, i) => i + 1);
const PANORAMA_ROWS = ['row-1', 'row-2', 'row-3', 'row-4'];
const CALENDAR_DAYS = Array.from({ length: 42 }, (_, i) => i + 1);

function TopStripBone() {
  return (
    <div
      className={classNames('home-top-strip app-skeleton-top-strip', styles.topStrip)}
      aria-hidden="true"
    >
      <div className={classNames('hts-id', styles.topStripId)}>
        <h1 className={classNames('', styles.topStripHeading)}>盘面</h1>
        <Bone className="app-skeleton-bone--session" style={styles.sessionBone} />
        <Bone className="app-skeleton-bone--hts-date" style={styles.htsDateBone} />
      </div>
      <div className={classNames('hts-cluster', styles.topStripCluster)}>
        {INDEX_BONES.map((key) => (
          <Bone key={key} className="app-skeleton-bone--index" style={styles.indexBone} />
        ))}
      </div>
      <div
        className={classNames(
          'app-skeleton-market-temp',
          styles.marketTemp,
          styles.temp,
        )}
      >
        <Bone className="app-skeleton-bone--temp-label" style={styles.tempLabelBone} />
        <Bone className="app-skeleton-bone--temp-gauge" style={styles.tempGaugeBone} />
        <Bone className="app-skeleton-bone--temp-sub" style={styles.tempSubBone} />
      </div>
    </div>
  );
}

function SymbolCardBone() {
  return (
    <div
      className={classNames('card app-skeleton-symbol-card', styles.card, styles.symbolCard)}
      aria-hidden="true"
    >
      <div className={classNames('app-skeleton-symbol-head', styles.symbolHead)}>
        <Bone className="app-skeleton-bone--sym" style={styles.symbolBone} />
        <Bone className="app-skeleton-bone--badge" style={styles.badgeBone} />
        <Bone className="app-skeleton-bone--quote" style={styles.quoteBone} />
      </div>
      <div className={classNames('app-skeleton-symbol-levels', styles.symbolLevels)}>
        <Bone className="app-skeleton-bone--level" style={styles.levelBone} />
        <Bone className="app-skeleton-bone--level" style={styles.levelBone} />
        <Bone className="app-skeleton-bone--level" style={styles.levelBone} />
      </div>
    </div>
  );
}

function TimelineBone() {
  return (
    <div
      className={classNames('date-timeline app-skeleton-timeline', styles.timeline)}
      aria-hidden="true"
    >
      <div className={classNames('dtl-track', styles.timelineTrack)}>
        {TIMELINE_BONES.map((day) => (
          <div className={classNames('dtl-item', styles.timelineItem)} key={day}>
            <span className={classNames('dtl-month', styles.timelineMonth)}>
              {day === 1 ? '7月' : '\u00A0'}
            </span>
            <span className={classNames('dtl-dot', styles.timelineDot)} />
            <Bone
              className="dtl-day app-skeleton-bone--timeline-day"
              style={styles.timelineDayBone}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionsBone() {
  return (
    <div
      className={classNames(
        'card positions-card app-skeleton-positions',
        styles.card,
        styles.positions,
      )}
      aria-hidden="true"
    >
      <div className={classNames('positions-summary', styles.positionsSummary)}>
        <Bone className="app-skeleton-bone--stat" style={styles.statBone} />
        <Bone className="app-skeleton-bone--stat" style={styles.statBone} />
        <Bone className="app-skeleton-bone--stat" style={styles.statBone} />
        <Bone className="app-skeleton-bone--stat" style={styles.statBone} />
      </div>
      <div className={classNames('positions-list', styles.positionsList)}>
        {POSITION_ROWS.map((row) => (
          <div className={classNames('positions-row', styles.positionsRow)} key={row}>
            <Bone
              className="app-skeleton-bone--position-symbol"
              style={styles.positionSymbolBone}
            />
            <Bone
              className="app-skeleton-bone--position-detail"
              style={styles.positionDetailBone}
            />
            <Bone className="app-skeleton-bone--position-last" style={styles.positionLastBone} />
            <Bone className="app-skeleton-bone--position-pct" style={styles.positionPctBone} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCalendarBone() {
  return (
    <div
      className={classNames('event-calendar app-skeleton-event-calendar', styles.eventCalendar)}
      aria-hidden="true"
    >
      <div className={classNames('cal-nav', styles.calendarNav)}>
        <Bone className="app-skeleton-bone--cal-button" style={styles.calendarButtonBone} />
        <Bone className="app-skeleton-bone--cal-title" style={styles.calendarTitleBone} />
        <Bone className="app-skeleton-bone--cal-button" style={styles.calendarButtonBone} />
      </div>
      <div className={classNames('cal-weekdays', styles.calendarWeekdays)}>
        {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => (
          <Bone className="app-skeleton-bone--weekday" style={styles.weekdayBone} key={day} />
        ))}
      </div>
      <div className={classNames('cal-grid', styles.calendarGrid)}>
        {CALENDAR_DAYS.map((day) => (
          <div className={classNames('cal-day app-skeleton-cal-day', styles.calendarDay)} key={day}>
            <Bone className="app-skeleton-bone--cal-day" style={styles.calendarDayBone} />
          </div>
        ))}
      </div>
      <div className={classNames('event-strip', styles.eventStrip)}>
        <Bone className="app-skeleton-bone--event-label" style={styles.eventLabelBone} />
        <Bone className="app-skeleton-bone--event-row" style={styles.eventRowBone} />
        <Bone className="app-skeleton-bone--event-row" style={styles.eventRowBone} />
      </div>
    </div>
  );
}

export function AppSkeleton() {
  const desktop = isElectronShell();

  return (
    <div
      className={classNames(
        `app-skeleton${desktop ? ' app-skeleton--desktop' : ''}`,
        styles.root,
        desktop && styles.desktop,
      )}
      aria-busy="true"
      aria-label="加载中"
    >
      {desktop && (
        <div className={classNames('app-skeleton-titlebar', styles.titlebar)}>
          <div className={classNames('app-skeleton-traffic', styles.traffic)} />
          <div className={classNames('app-skeleton-tabstrip', styles.tabstrip)}>
            <Bone className="app-skeleton-bone--tab" style={styles.tabBone} />
          </div>
        </div>
      )}

      <div className={classNames('page app-skeleton-page', styles.page)}>
        <TopStripBone />

        <div className={classNames('quickbar', styles.quickbar)} aria-hidden="true">
          <Bone className="app-skeleton-bone--input" style={styles.inputBone} />
          {SHORTCUT_BONES.map((key) => (
            <Bone className="app-skeleton-bone--chip" style={styles.chipBone} key={key} />
          ))}
          <div className={classNames('quickbar-actions', styles.quickbarActions)}>
            <Bone className="app-skeleton-bone--action" style={styles.actionBone} />
            <Bone className="app-skeleton-bone--action" style={styles.actionBone} />
            <Bone className="app-skeleton-bone--action" style={styles.actionBone} />
          </div>
        </div>

        <TimelineBone />

        <div className={classNames('home-grid', styles.homeGrid)}>
          <div className="home-main">
            <div
              className={classNames('section-title section-title--with-age', styles.sectionTitle)}
            >
              看盘
            </div>
            <div className={classNames('overview-grid', styles.overviewGrid)} aria-hidden="true">
              <SymbolCardBone />
              <SymbolCardBone />
              <SymbolCardBone />
              <SymbolCardBone />
            </div>
            <div className={classNames('watch-tail', styles.watchTail)} aria-hidden="true">
              {TAIL_BONES.map((cell) => (
                <Bone
                  className="watch-tail-cell app-skeleton-tail-cell"
                  style={[styles.watchTailCell, styles.tailCell]}
                  key={cell}
                />
              ))}
            </div>
            <div
              className={classNames('section-title section-title--with-age', styles.sectionTitle)}
            >
              市场全景
            </div>
            <div className="market-panorama" aria-hidden="true">
              <div className={classNames('pano-tabs', styles.panoramaTabs)}>
                <Bone className="app-skeleton-bone--pano-tab" style={styles.panoramaTabBone} />
                <Bone className="app-skeleton-bone--pano-tab" style={styles.panoramaTabBone} />
              </div>
              <div className={classNames('pano-rows', styles.panoramaRows)}>
                {PANORAMA_ROWS.map((row) => (
                  <div className={classNames('pano-row', styles.panoramaRow)} key={row}>
                    <Bone
                      className="pano-sector app-skeleton-pano-sector"
                      style={[styles.panoramaSector, styles.panoramaSectorBone]}
                    />
                    <Bone
                      className="pano-sector app-skeleton-pano-sector"
                      style={[styles.panoramaSector, styles.panoramaSectorBone]}
                    />
                  </div>
                ))}
              </div>
              <div
                className={classNames('pano-chips app-skeleton-pano-chips', styles.panoramaChips)}
              >
                <Bone className="app-skeleton-bone--pano-chip" style={styles.panoramaChipBone} />
                <Bone className="app-skeleton-bone--pano-chip" style={styles.panoramaChipBone} />
                <Bone className="app-skeleton-bone--pano-chip" style={styles.panoramaChipBone} />
              </div>
              <Bone
                className="sector-read app-skeleton-sector-read"
                style={[styles.sectorRead, styles.sectorReadBone]}
              />
            </div>
          </div>
          <div className="home-side">
            <div className={classNames('home-side-content', styles.pageSideContent)}>
              <div
                className={classNames('section-title section-title--with-age', styles.sectionTitle)}
              >
                持仓
              </div>
              <PositionsBone />
              <div className={classNames('section-title', styles.sectionTitle)}>事件日历</div>
              <EventCalendarBone />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
