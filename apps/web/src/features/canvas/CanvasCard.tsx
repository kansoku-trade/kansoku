import { TimeAgo } from '@web/ui';

export function CanvasCard({
  slug,
  title,
  mtime,
  onOpen,
  onSource,
}: {
  slug: string;
  title: string;
  mtime?: string;
  onOpen: () => void;
  onSource: () => void;
}) {
  return (
    <div className="canvas-card">
      <div className="canvas-card-thumb" aria-hidden="true" />
      <div className="canvas-card-body">
        <div className="canvas-card-title">{title}</div>
        <div className="canvas-card-meta">
          <span>{slug}</span>
          {mtime ? (
            <>
              <span aria-hidden="true"> · </span>
              <TimeAgo since={mtime} />
            </>
          ) : null}
        </div>
        <div className="canvas-card-actions">
          <button type="button" className="link-button" onClick={onOpen}>
            打开
          </button>
          <button type="button" className="link-button" disabled title="本版暂不支持新窗口">
            新窗口
          </button>
          <button type="button" className="link-button" onClick={onSource}>
            源码
          </button>
        </div>
      </div>
    </div>
  );
}
