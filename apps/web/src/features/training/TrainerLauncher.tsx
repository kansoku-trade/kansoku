import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TrainerErrorCode, TrainerFillPhase, TrainerFillTask, TrainerView } from '@kansoku/pro-api';
import { errorMessage } from '@web/lib/api';
import { Button } from '@web/ui';
import { getTrainerBridge } from '../desktop/desktopTrainerBridge';
import { getShellRpc } from '../desktop/shellRpc';
import { TrainerChart } from './TrainerChart';
import { useTrainerFill } from './useTrainerFill';

const BASE_PERIOD = '5m';
const REFILL_TARGET = 15;

const PLAYBOOK = [
  { title: '选方向', body: '看图定多空。看不准就观望——观望也算一次决定。' },
  { title: '放线', body: '拖出止损和目标。赚的空间不到亏的 1.5 倍，这一局不让你进。' },
  { title: '推进', body: '一根一根往前走，每根都要写下你为什么还拿着。走过的不能回头。' },
  { title: '结算', body: '看你赚了多少，也看曾经到手又吐回去多少。' },
];

// The pool's own stages, in the order a fill walks them. Naming them turns a wait with nothing on
// screen into the one thing worth watching here: cases being screened out of years of tape.
const FILL_PHASES: { key: TrainerFillPhase; label: string }[] = [
  { key: 'sample', label: '取样' },
  { key: 'hard-rule-gate', label: '过规则' },
  { key: 'assemble', label: '拼行情' },
  { key: 'ai-pick', label: 'AI 挑' },
  { key: 'anonymize', label: '抹身份' },
  { key: 'audit', label: '复查' },
];

interface TrainerSession {
  sessionId: string;
  view: TrainerView;
}

interface OpenFailure {
  code: TrainerErrorCode | null;
  message: string;
}

function TrainerBoot({ children }: { children: ReactNode }) {
  const isDesktop = getShellRpc() !== null;
  return (
    <div className="trainer-boot">
      <div className="trainer-boot-bar">{isDesktop && <div className="popout-traffic-spacer" />}</div>
      <div className="trainer-boot-scroll">
        <div className="trainer-boot-shell">{children}</div>
      </div>
    </div>
  );
}

function TrainerNotice({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string | null;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <TrainerBoot>
      <div className="trainer-boot-status trainer-boot-status--alone">
        <div className="trainer-boot-status-title">{title}</div>
        {detail && <div className="trainer-boot-status-detail">{detail}</div>}
        {action && (
          <Button disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </TrainerBoot>
  );
}

function Playbook() {
  return (
    <>
      <header className="trainer-boot-head">
        <h1 className="trainer-boot-name">盲盘训练</h1>
        <p className="trainer-boot-thesis">
          一段真实发生过的行情，名字和日期都抹掉了。你只看得见光标左边——不知道是谁、哪一年，就没法
          用记忆代替判断。
        </p>
      </header>
      <ol className="trainer-boot-steps">
        {PLAYBOOK.map((step, index) => (
          <li key={step.title} className="trainer-boot-step">
            <span className="trainer-boot-step-index">{index + 1}</span>
            <div className="trainer-boot-step-text">
              <span className="trainer-boot-step-title">{step.title}</span>
              <span className="trainer-boot-step-body">{step.body}</span>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function FillPipeline({ task }: { task: TrainerFillTask }) {
  const active = FILL_PHASES.findIndex((phase) => phase.key === task.phase);
  return (
    <ol className="trainer-fill-pipeline" aria-label={task.activity}>
      {FILL_PHASES.map((phase, index) => {
        const state = index < active ? ' is-done' : index === active ? ' is-active' : '';
        return (
          <li key={phase.key} className={`trainer-fill-phase${state}`}>
            <span className="trainer-fill-phase-bar" />
            <span className="trainer-fill-phase-label">{phase.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PoolStatus({
  task,
  suspended,
  error,
  onRefill,
  refilling,
}: {
  task: TrainerFillTask | null;
  suspended: boolean;
  error: string | null;
  onRefill: () => void;
  refilling: boolean;
}) {
  if (task?.status === 'running')
    return (
      <div className="trainer-boot-status">
        <div className="trainer-boot-status-row">
          <span className="trainer-boot-status-title">正在攒案例</span>
          <span className="trainer-boot-status-count num">
            {task.admitted}/{task.requested}
          </span>
        </div>
        <FillPipeline task={task} />
        <div className="trainer-boot-status-detail">{task.activity}</div>
      </div>
    );

  const title = suspended ? '连着两次没攒到，自动补货停了' : '案例池是空的';
  const detail =
    error ?? (task?.status === 'failed' ? `上次补货失败：${task.error ?? '未知原因'}` : null);
  return (
    <div className="trainer-boot-status">
      <div className="trainer-boot-status-row">
        <span className="trainer-boot-status-title">{title}</span>
      </div>
      {detail && <div className="trainer-boot-status-detail">{detail}</div>}
      <Button disabled={refilling} onClick={onRefill}>
        补货
      </Button>
    </div>
  );
}

export function TrainerLauncher() {
  const bridge = useMemo(() => getTrainerBridge(), []);
  const [session, setSession] = useState<TrainerSession | null>(null);
  const [failure, setFailure] = useState<OpenFailure | null>(null);
  const [opening, setOpening] = useState(bridge !== null);
  const [attempt, setAttempt] = useState(0);
  const [refilledTaskId, setRefilledTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge
      .open({ basePeriod: BASE_PERIOD })
      .then((result) => {
        if (!active) return;
        if (result.ok) setSession({ sessionId: result.data.sessionId, view: result.data.view });
        else setFailure({ code: result.code, message: result.error });
      })
      .catch((error: unknown) => {
        if (active) setFailure({ code: null, message: errorMessage(error) });
      })
      .finally(() => {
        if (active) setOpening(false);
      });
    return () => {
      active = false;
    };
  }, [bridge, attempt]);

  const reopen = () => {
    setFailure(null);
    setOpening(true);
    setAttempt((current) => current + 1);
  };

  const poolEmpty = failure?.code === 'TRAINER_POOL_EMPTY';
  const fill = useTrainerFill(bridge !== null && poolEmpty);
  const task = fill.state.task;
  const admittedTaskId = task?.status === 'done' && task.admitted > 0 ? task.id : null;

  // An open that found the pool empty has already kicked off a refill on the pro side, so this
  // window is both the one that reported the dead end and the one that can undo it. Reopening
  // during render (see TrainerChart's case-id reset for the same idiom) keeps the trader from ever
  // seeing a "the pool filled up" screen they would have to acknowledge by hand.
  if (admittedTaskId && admittedTaskId !== refilledTaskId && !session) {
    setRefilledTaskId(admittedTaskId);
    reopen();
  }

  if (session)
    return (
      <TrainerChart
        view={session.view}
        sessionId={session.sessionId}
        bridge={bridge ?? undefined}
        onViewChange={(view) => setSession((prev) => (prev ? { ...prev, view } : prev))}
      />
    );

  if (!bridge) return <TrainerNotice title="盲盘训练只在桌面端可用" />;
  if (opening) return <TrainerNotice title="正在开局…" />;

  if (poolEmpty)
    return (
      <TrainerBoot>
        <Playbook />
        <PoolStatus
          task={task}
          suspended={fill.state.autoRefillSuspended}
          error={fill.error}
          refilling={fill.pending}
          onRefill={() =>
            fill.startFill(BASE_PERIOD, Math.max(1, REFILL_TARGET - (task?.admitted ?? 0)))
          }
        />
      </TrainerBoot>
    );

  return (
    <TrainerNotice
      title="打不开训练局"
      detail={failure?.message}
      action={{ label: '重试', onClick: reopen }}
    />
  );
}
