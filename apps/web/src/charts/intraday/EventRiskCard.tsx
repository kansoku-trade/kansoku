import { CalendarClock } from "lucide-react";
import type { IntradayEventRisk } from "@kansoku/shared/types";
import { MarketTime } from "@web/ui";

interface EventRiskCardProps {
  eventRisk: IntradayEventRisk | null | undefined;
}

export function EventRiskCard({ eventRisk }: EventRiskCardProps) {
  if (!eventRisk) return null;
  const { next_earnings, macro } = eventRisk;
  if (!next_earnings && !macro.length) return null;

  return (
    <div className="event-card">
      <div className="event-card-label">
        <CalendarClock className="icon" size={13} /> 事件风险
      </div>
      {next_earnings && (
        <div className="event-row">
          <span className="event-time">{next_earnings.date.slice(5)}</span>
          <span className="event-title">财报 · {next_earnings.title}</span>
        </div>
      )}
      {macro.map((m) => (
        <div className="event-row" key={`${m.ts}-${m.title}`}>
          <span className="event-time">
            <MarketTime value={m.ts} format="month-day-time" />
          </span>
          <span className="event-title">
            {m.title}
            {m.estimate ? `（预期 ${m.estimate}）` : m.previous ? `（前值 ${m.previous}）` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
