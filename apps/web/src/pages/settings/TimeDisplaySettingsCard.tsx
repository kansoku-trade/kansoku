import { localTimeZone } from "@kansoku/shared/time";
import {
  setTimeDisplayPreference,
  type TimeDisplayPreference,
  useTimeDisplayPreference,
} from "@web/timeDisplayPreference";
import { Card, SectionTitle, SegmentedControl, type SegmentedControlOption } from "@web/ui";

const OPTIONS = [
  { value: "market", label: "美东时间" },
  { value: "local", label: "本地时间" },
] satisfies readonly SegmentedControlOption<TimeDisplayPreference>[];

export function TimeDisplaySettingsCard() {
  const preference = useTimeDisplayPreference();
  const timeZone = localTimeZone();

  return (
    <Card className="settings-display-card">
      <div className="settings-card-heading">
        <SectionTitle>显示</SectionTitle>
      </div>
      <div className="settings-time-preference">
        <div className="settings-preference-copy">
          <div className="settings-preference-name">优先显示的时间</div>
          <div className="settings-preference-description">
            本地时区：{timeZone}。悬停时显示另一时区。
          </div>
        </div>
        <SegmentedControl
          ariaLabel="优先显示的时间"
          className="settings-time-mode"
          value={preference}
          options={OPTIONS}
          onChange={setTimeDisplayPreference}
        />
      </div>
    </Card>
  );
}
