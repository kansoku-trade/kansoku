import type { PositionView } from "@kansoku/shared/types";
import { fmt, signed, upDown } from "@web/format";
import { SectionTitle } from "@web/ui";

interface PositionTabProps {
  position: PositionView | null;
}

export function PositionTab({ position }: PositionTabProps) {
  if (!position) return null;

  return (
    <>
      <SectionTitle>持仓视角</SectionTitle>
      <div className="grid2">
        <div className="k">持仓</div>
        <div className="v">{position.shares} sh</div>
        <div className="k">成本</div>
        <div className="v">${fmt(position.cost)}</div>
        <div className="k">浮{position.unrealized >= 0 ? "盈" : "亏"}</div>
        <div className={`v ${upDown(position.unrealized)}`}>
          {signed(position.unrealized)} ({signed(position.unrealizedPct)}%)
        </div>
      </div>
    </>
  );
}
