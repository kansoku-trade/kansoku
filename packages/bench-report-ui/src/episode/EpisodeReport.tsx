import type { EpisodeReportViewData } from '../types';
import * as styles from './EpisodeReport.css';

export function EpisodeReport({ data }: { data: EpisodeReportViewData }) {
  return (
    <div className={styles.root}>
      <h1 className={styles.header}>{data.runId}</h1>
      <p>{data.generatedAt}</p>
    </div>
  );
}
