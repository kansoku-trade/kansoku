import { GenerateAnalysis } from './GenerateAnalysis';

export function GenerateAnalysisCta({
  sym,
  title,
  desc,
}: {
  sym: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="preview-cta">
      <h3 className="preview-cta-title">{title}</h3>
      <p className="preview-cta-desc">{desc}</p>
      <GenerateAnalysis sym={sym} />
    </div>
  );
}
