import { useRef } from 'react';
import type { SepaBuilt } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { fmt } from '@web/lib/format';
import { LayerPanel } from '../LayerPanel';
import { SepaSidebar } from './SepaSidebar';
import { useSepaCharts } from './useSepaCharts';
import { seriesPalette } from '@web/lib/theme';
import { colors, fontSizes, sizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  layout: {
    display: 'grid',
    gridTemplateColumns: `1fr ${sizes.sidebarWidth}`,
    height: '100%',
    position: 'relative',
  },
  chartsCol: {
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chartBlock: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    position: 'relative',
  },
  mainChartBlock: {
    flex: '0 0 62%',
  },
  rsChartBlock: {
    flex: '0 0 19%',
  },
  volChartBlock: {
    borderBottomStyle: 'none',
    borderBottomWidth: 0,
    flex: '0 0 19%',
  },
  chartHost: {
    height: '100%',
    width: '100%',
  },
  chartLabel: {
    backgroundColor: 'rgba(10, 10, 10, 0.7)',
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    left: '12px',
    letterSpacing: '0.05em',
    padding: '2px 8px',
    position: 'absolute',
    textTransform: 'uppercase',
    top: '8px',
    zIndex: 10,
  },
  chartLegend: {
    backgroundColor: 'rgba(10, 10, 10, 0.7)',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gap: '14px',
    left: '110px',
    padding: '2px 8px',
    position: 'absolute',
    top: '8px',
    zIndex: 10,
  },
  swatch: {
    display: 'inline-block',
    height: '2px',
    marginRight: '4px',
    verticalAlign: 'middle',
    width: '10px',
  },
  vpCanvas: {
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
});

export function SepaDashboard({ built }: { built: SepaBuilt }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsRef = useRef<HTMLDivElement>(null);
  const vrRef = useRef<HTMLDivElement>(null);
  const vpCanvasRef = useRef<HTMLCanvasElement>(null);
  const groups = useSepaCharts(built.chart, mainRef, rsRef, vrRef, vpCanvasRef);
  const kv = built.sidebar.keyValues;

  return (
    <div className={`layout ${stylex.props(styles.layout).className}`}>
      <div className={`charts-col ${stylex.props(styles.chartsCol).className}`}>
        <div
          className={`chart-block main ${stylex.props(styles.chartBlock, styles.mainChartBlock).className}`}
        >
          <div className={`chart-label ${stylex.props(styles.chartLabel).className}`}>
            主图 · 日 K + 均线
          </div>
          <div className={`chart-legend ${stylex.props(styles.chartLegend).className}`}>
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: seriesPalette[0] }}
              />
              MA50 ${fmt(kv.ma50)}
            </span>
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: seriesPalette[4] }}
              />
              MA150 ${fmt(kv.ma150)}
            </span>
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: seriesPalette[1] }}
              />
              MA200 ${fmt(kv.ma200)}
            </span>
          </div>
          <LayerPanel groups={groups} />
          <canvas
            ref={vpCanvasRef}
            className={`vp-canvas ${stylex.props(styles.vpCanvas).className}`}
          />
          <div ref={mainRef} className={`chart-host ${stylex.props(styles.chartHost).className}`} />
        </div>
        <div
          className={`chart-block rs ${stylex.props(styles.chartBlock, styles.rsChartBlock).className}`}
        >
          <div className={`chart-label ${stylex.props(styles.chartLabel).className}`}>
            RS vs SPY (跑赢百分点)
          </div>
          <div className={`chart-legend ${stylex.props(styles.chartLegend).className}`}>
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: seriesPalette[2] }}
              />
              21d
            </span>
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: seriesPalette[4] }}
              />
              63d
            </span>
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: seriesPalette[3] }}
              />
              126d
            </span>
          </div>
          <div ref={rsRef} className={`chart-host ${stylex.props(styles.chartHost).className}`} />
        </div>
        <div
          className={`chart-block vol ${stylex.props(styles.chartBlock, styles.volChartBlock).className}`}
        >
          <div className={`chart-label ${stylex.props(styles.chartLabel).className}`}>
            量能比 (vs 20MA)
          </div>
          <div ref={vrRef} className={`chart-host ${stylex.props(styles.chartHost).className}`} />
        </div>
      </div>
      <SepaSidebar built={built} />
    </div>
  );
}
