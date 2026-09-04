import { isDesktopRealtime } from '@web/lib/portTransport';
import { NoteBlock } from '@web/ui';
import { AgentKitSection } from './AgentKitSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { LicenseSection } from './LicenseSection';
import { LongbridgeSection } from './LongbridgeSection';
import { OpencliSection } from './OpencliSection';
import { TimeDisplaySettingsCard } from './TimeDisplaySettingsCard';
import { TrainingSection } from './TrainingSection';
import { WatchedMarketsCard } from './WatchedMarketsCard';
import { WebSearchSection } from './WebSearchSection';
import { WorkspaceSection } from './WorkspaceSection';
import type { SettingsSectionId } from './types';
import { useProComposition } from '../edition/useProComposition';

function ProSections({ section }: { section: SettingsSectionId }) {
  const pro = useProComposition();
  const entries = pro.status === 'ready' ? (pro.composition?.settingsSections ?? []) : [];
  return entries
    .filter((entry) => entry.section === section)
    .map(({ id, Component }) => <Component key={id} />);
}

export function DisplayPane() {
  return (
    <>
      <TimeDisplaySettingsCard />
      <WatchedMarketsCard />
      <ProSections section="display" />
    </>
  );
}

export function ConnectionsPane() {
  if (!isDesktopRealtime()) return <NoteBlock>这些设置只在桌面版可用。</NoteBlock>;
  return (
    <>
      <LongbridgeSection />
      <OpencliSection />
      <WebSearchSection />
      <WorkspaceSection />
      <ProSections section="connections" />
    </>
  );
}

export function LicensePane() {
  return (
    <>
      <LicenseSection />
      <ProSections section="license" />
    </>
  );
}

export function AdvancedPane() {
  if (!isDesktopRealtime()) return <NoteBlock>这些设置只在桌面版可用。</NoteBlock>;
  return (
    <>
      <AgentKitSection />
      <TrainingSection />
      <DiagnosticsSection />
      <ProSections section="advanced" />
    </>
  );
}
