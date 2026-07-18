import { Lock, RadioTower } from "lucide-react";
import { useCapabilities } from "../../capabilitiesStore";
import { useFeatureGuard } from "../../featureGuard";
import { Switch } from "../../ui";
import { useSymbolFollow } from "../../useSymbolFollow";

export function FollowAction({ symbol, revision }: { symbol: string; revision?: string }) {
  const { pro } = useCapabilities();
  if (pro !== true) return null;
  return <FollowControl symbol={symbol} revision={revision} />;
}

function FollowControl({ symbol, revision }: { symbol: string; revision?: string }) {
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, revision });
  const { locked, guard } = useFeatureGuard();

  return (
    <span
      className={`follow-control${statusError ? " follow-control--error" : ""}${locked ? " follow-control--locked" : ""}`}
      title={
        locked
          ? following
            ? "授权已失效，AI 跟进已暂停；可关闭开关，重新开启需订阅"
            : "AI 跟进需要有效授权，点击开关订阅解锁"
          : statusError ??
            (following
              ? "AI 评论员会在后台持续跟进；关闭此图表不会停止"
              : "AI 评论员已停止跟进此标的")
      }
    >
      <RadioTower size={13} />
      <span className="follow-control-label">AI 跟进</span>
      {locked && <Lock className="follow-control-lock" size={11} />}
      <Switch
        ariaLabel="持续跟进 AI 点评"
        checked={following ?? false}
        disabled={busy}
        onCheckedChange={(checked) => {
          if (locked && checked) {
            guard(() => {});
            return;
          }
          void change(checked);
        }}
      />
    </span>
  );
}
