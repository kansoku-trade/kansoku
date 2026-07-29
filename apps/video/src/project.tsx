import { Audio, Img, Layout, Line, Rect, Txt, makeScene2D } from '@revideo/2d';
import {
  all,
  createRef,
  createSignal,
  easeInOutCubic,
  easeOutCubic,
  makeProject,
  sequence,
  waitFor,
} from '@revideo/core';

const C = {
  bg: '#080A0C',
  border: '#30353A',
  dim: '#7D878F',
  grid: '#1B2024',
  paper: '#E7ECEF',
  red: '#FF5B5B',
  teal: '#2BC3B4',
  yellow: '#F7C843',
};

const font = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif';
const mono = 'DIN Alternate, SFMono-Regular, Menlo, monospace';

function Label({ accent = C.yellow, code, text }: { accent?: string; code: string; text: string }) {
  return (
    <Layout layout direction={'row'} alignItems={'center'} gap={16}>
      <Rect width={8} height={8} fill={accent} />
      <Txt
        text={code}
        fontFamily={mono}
        fontSize={21}
        fontWeight={700}
        letterSpacing={3}
        fill={accent}
      />
      <Line
        points={[
          [0, 0],
          [68, 0],
        ]}
        stroke={C.border}
        lineWidth={1}
      />
      <Txt text={text} fontFamily={font} fontSize={23} fill={C.dim} />
    </Layout>
  );
}

function Pill({ accent = C.teal, text }: { accent?: string; text: string }) {
  return (
    <Rect padding={[12, 20]} fill={'#0B0E10E8'} stroke={accent} lineWidth={1} radius={4}>
      <Txt text={text} fontFamily={font} fontSize={22} fontWeight={600} fill={C.paper} />
    </Rect>
  );
}

function Corner({
  x,
  y,
  flipX = 1,
  flipY = 1,
}: {
  x: number;
  y: number;
  flipX?: number;
  flipY?: number;
}) {
  return (
    <Line
      position={[x, y]}
      points={[
        [0, 32 * flipY],
        [0, 0],
        [32 * flipX, 0],
      ]}
      stroke={C.yellow}
      lineWidth={2}
    />
  );
}

const mainScene = makeScene2D('kansoku-story-recut', function* (view) {
  const gridOpacity = createSignal(0.45);
  const hook = createRef<Layout>();
  const hookImg = createRef<Img>();
  const hookLineOne = createRef<Txt>();
  const hookLineTwo = createRef<Txt>();
  const stage = createRef<Layout>();
  const frame = createRef<Rect>();
  const sectionCode = createRef<Txt>();
  const title = createRef<Txt>();

  const home = createRef<Img>();
  const cockpit = createRef<Img>();
  const sepa = createRef<Img>();
  const research = createRef<Img>();
  const trainer = createRef<Img>();

  const railHome = createRef<Layout>();
  const railChart = createRef<Layout>();
  const railSepa = createRef<Layout>();
  const railScenario = createRef<Layout>();
  const railResearch = createRef<Layout>();
  const railTrainer = createRef<Layout>();
  const followCard = createRef<Rect>();
  const localFlow = createRef<Layout>();
  const flowOne = createRef<Rect>();
  const flowTwo = createRef<Rect>();
  const flowThree = createRef<Rect>();
  const flowFour = createRef<Rect>();
  const endCard = createRef<Layout>();

  view.fill(C.bg);
  view.add(
    <>
      <Audio src={'/audio/observed-path.mp3'} play volume={3.2} />

      <Layout opacity={gridOpacity}>
        {Array.from({ length: 17 }, (_, index) => (
          <Line
            key={`v-${index}`}
            points={[
              [-960 + index * 120, -540],
              [-960 + index * 120, 540],
            ]}
            stroke={C.grid}
            lineWidth={1}
          />
        ))}
        {Array.from({ length: 10 }, (_, index) => (
          <Line
            key={`h-${index}`}
            points={[
              [-960, -540 + index * 120],
              [960, -540 + index * 120],
            ]}
            stroke={C.grid}
            lineWidth={1}
          />
        ))}
      </Layout>

      <Layout ref={hook}>
        <Img ref={hookImg} src={'/captures/cockpit-live.png'} width={3200} x={-620} y={88} />
        <Rect width={1920} height={1080} fill={'#05070A'} opacity={0.58} />
        <Txt
          ref={hookLineOne}
          x={-420}
          y={-66}
          width={860}
          textAlign={'left'}
          opacity={0}
          text={'别问 AI 买什么。'}
          fontFamily={font}
          fontSize={80}
          fontWeight={700}
          fill={C.paper}
          shadowColor={'#000000'}
          shadowBlur={28}
        />
        <Txt
          ref={hookLineTwo}
          x={-420}
          y={62}
          width={860}
          textAlign={'left'}
          opacity={0}
          text={'问它：凭什么。'}
          fontFamily={font}
          fontSize={80}
          fontWeight={700}
          fill={C.yellow}
          shadowColor={'#000000'}
          shadowBlur={28}
        />
      </Layout>

      <Layout ref={stage} opacity={0}>
        <Txt
          ref={sectionCode}
          x={-790}
          y={-468}
          text={'01 / PRE-MARKET'}
          fontFamily={mono}
          fontSize={20}
          fontWeight={700}
          letterSpacing={4}
          fill={C.yellow}
        />
        <Txt
          ref={title}
          x={-80}
          y={-402}
          width={1500}
          textAlign={'left'}
          text={'盘前，先看一眼全局。'}
          fontFamily={font}
          fontSize={62}
          fontWeight={700}
          fill={C.paper}
        />

        <Rect
          ref={frame}
          y={72}
          width={1660}
          height={840}
          radius={18}
          clip
          stroke={C.border}
          lineWidth={2}
          fill={'#111417'}
          shadowColor={'#000000'}
          shadowBlur={48}
          shadowOffsetY={24}
        >
          <Rect y={-402} width={1660} height={36} fill={'#171B1F'} />
          <Layout x={-777} y={-402} layout direction={'row'} gap={10}>
            <Rect size={10} radius={5} fill={C.red} />
            <Rect size={10} radius={5} fill={C.yellow} />
            <Rect size={10} radius={5} fill={C.teal} />
          </Layout>

          <Img ref={home} y={54} src={'/captures/app-home.webp'} width={1660} />
          <Img ref={cockpit} y={42} src={'/captures/cockpit-live.png'} width={1660} opacity={0} />
          <Img ref={sepa} y={54} src={'/captures/app-sepa.webp'} width={1660} opacity={0} />
          <Img ref={research} y={52} src={'/captures/app-research.webp'} width={1660} opacity={0} />
          <Img ref={trainer} y={40} src={'/captures/app-trainer.png'} width={1660} opacity={0} />
        </Rect>

        <Corner x={-850} y={-348} />
        <Corner x={850} y={-348} flipX={-1} />
        <Corner x={-850} y={492} flipY={-1} />
        <Corner x={850} y={492} flipX={-1} flipY={-1} />

        <Layout ref={railHome} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'市场热力'} />
          <Pill text={'事件日历'} accent={C.red} />
          <Pill text={'自选'} accent={C.yellow} />
          <Pill text={'历史复盘'} />
          <Pill text={'US / HK / CN'} accent={C.yellow} />
        </Layout>

        <Layout ref={railChart} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'5m / 15m / 1h 同屏'} accent={C.yellow} />
          <Pill text={'指标本机算'} />
          <Pill text={'画线可留档'} accent={C.red} />
        </Layout>

        <Layout
          ref={railSepa}
          layout
          y={430}
          direction={'row'}
          alignItems={'center'}
          gap={14}
          opacity={0}
        >
          <Pill text={'趋势模板'} accent={C.yellow} />
          <Pill text={'相对强弱'} />
          <Pill text={'量能'} accent={C.red} />
          <Txt text={'→'} fontFamily={mono} fontSize={26} fill={C.dim} />
          <Pill text={'BUY / WATCH / AVOID'} />
        </Layout>

        <Layout ref={railScenario} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'Bull / Base / Bear'} accent={C.yellow} />
          <Pill text={'各带概率和触发条件'} />
        </Layout>

        <Layout ref={railResearch} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'文档内追问'} />
          <Pill text={'改稿可撤销'} accent={C.yellow} />
        </Layout>

        <Layout ref={railTrainer} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'匿名代码与日期'} accent={C.yellow} />
          <Pill text={'逐根推进'} />
          <Pill text={'按 R 结算'} accent={C.red} />
        </Layout>

        <Rect
          ref={followCard}
          x={-430}
          y={252}
          width={680}
          height={196}
          layout={false}
          opacity={0}
          fill={'#0B0E10F2'}
          stroke={C.red}
          lineWidth={1}
        >
          <Layout layout direction={'row'} alignItems={'center'} gap={14} y={-60}>
            <Rect size={12} radius={6} fill={C.red} />
            <Txt
              text={'BACKGROUND WATCH'}
              fontFamily={mono}
              fontSize={19}
              letterSpacing={3}
              fill={C.red}
            />
          </Layout>
          <Txt
            y={4}
            text={'情景失效 → 弹通知 → 带你回到证据'}
            fontFamily={font}
            fontSize={28}
            fontWeight={700}
            fill={C.paper}
          />
          <Txt
            y={62}
            text={'Bull 25% · Base 30% · Bear 45%'}
            fontFamily={mono}
            fontSize={20}
            fill={C.yellow}
          />
        </Rect>
      </Layout>

      <Layout ref={localFlow} opacity={0}>
        <Layout y={-300}>
          <Label code={'06 / PAPER TRAIL'} text={'YOUR DATA, YOUR PIPELINE'} />
        </Layout>
        <Txt
          y={-205}
          text={'行情 → 实算 → 模型 → 归档，全程留痕。'}
          fontFamily={font}
          fontSize={54}
          fontWeight={700}
          fill={C.paper}
        />
        <Layout layout y={22} direction={'row'} alignItems={'center'} gap={22}>
          <Rect
            ref={flowOne}
            width={300}
            height={180}
            layout
            direction={'column'}
            alignItems={'center'}
            justifyContent={'center'}
            gap={12}
            opacity={0}
            fill={'#101417'}
            stroke={C.teal}
          >
            <Txt text={'01'} fontFamily={mono} fontSize={20} fill={C.teal} />
            <Txt
              text={'长桥行情'}
              fontFamily={font}
              fontSize={31}
              fontWeight={700}
              fill={C.paper}
            />
            <Txt text={'你的账户直接读取'} fontFamily={font} fontSize={19} fill={C.dim} />
          </Rect>
          <Txt text={'→'} fontFamily={mono} fontSize={36} fill={C.border} />
          <Rect
            ref={flowTwo}
            width={300}
            height={180}
            layout
            direction={'column'}
            alignItems={'center'}
            justifyContent={'center'}
            gap={12}
            opacity={0}
            fill={'#101417'}
            stroke={C.yellow}
          >
            <Txt text={'02'} fontFamily={mono} fontSize={20} fill={C.yellow} />
            <Txt
              text={'本地实算'}
              fontFamily={font}
              fontSize={31}
              fontWeight={700}
              fill={C.paper}
            />
            <Txt text={'指标与形态不出机器'} fontFamily={font} fontSize={19} fill={C.dim} />
          </Rect>
          <Txt text={'→'} fontFamily={mono} fontSize={36} fill={C.border} />
          <Rect
            ref={flowThree}
            width={300}
            height={180}
            layout
            direction={'column'}
            alignItems={'center'}
            justifyContent={'center'}
            gap={12}
            opacity={0}
            fill={'#101417'}
            stroke={C.red}
          >
            <Txt text={'03'} fontFamily={mono} fontSize={20} fill={C.red} />
            <Txt
              text={'自选模型'}
              fontFamily={font}
              fontSize={31}
              fontWeight={700}
              fill={C.paper}
            />
            <Txt text={'调用和费用全部留痕'} fontFamily={font} fontSize={19} fill={C.dim} />
          </Rect>
          <Txt text={'→'} fontFamily={mono} fontSize={36} fill={C.border} />
          <Rect
            ref={flowFour}
            width={300}
            height={180}
            layout
            direction={'column'}
            alignItems={'center'}
            justifyContent={'center'}
            gap={12}
            opacity={0}
            fill={'#101417'}
            stroke={C.teal}
          >
            <Txt text={'04'} fontFamily={mono} fontSize={20} fill={C.teal} />
            <Txt
              text={'本地归档'}
              fontFamily={font}
              fontSize={31}
              fontWeight={700}
              fill={C.paper}
            />
            <Txt text={'Markdown / JSON'} fontFamily={mono} fontSize={19} fill={C.dim} />
          </Rect>
        </Layout>
        <Txt
          y={225}
          text={'模型自己挑 · 费用有账 · API key 不出本机'}
          fontFamily={font}
          fontSize={25}
          fill={C.dim}
        />
      </Layout>

      <Layout ref={endCard} opacity={0} scale={0.96}>
        <Img y={-150} src={'/brand/kansoku-icon.png'} width={112} />
        <Txt
          y={-25}
          text={'KANSOKU'}
          fontFamily={mono}
          fontSize={70}
          fontWeight={800}
          letterSpacing={12}
          fill={C.paper}
        />
        <Txt
          y={66}
          text={'不是替你下单。是让每个判断都有依据。'}
          fontFamily={font}
          fontSize={38}
          fontWeight={600}
          letterSpacing={2}
          fill={C.paper}
        />
        <Line
          y={136}
          points={[
            [-280, 0],
            [280, 0],
          ]}
          stroke={C.yellow}
          lineWidth={2}
        />
        <Txt
          y={192}
          text={'运行在你 Mac 上的个人研究工作台'}
          fontFamily={font}
          fontSize={23}
          fill={C.dim}
        />
        <Txt
          y={250}
          text={'kansoku.trade'}
          fontFamily={mono}
          fontSize={26}
          letterSpacing={4}
          fill={C.yellow}
        />
      </Layout>
    </>,
  );

  // 00:00–00:04 — hook over the live short-call panel
  yield* all(
    hookImg().scale(1.03, 4.0, easeInOutCubic),
    (function* () {
      yield* waitFor(0.2);
      yield* hookLineOne().opacity(1, 0.4);
      yield* waitFor(1.0);
      yield* hookLineTwo().opacity(1, 0.4);
      yield* waitFor(2.0);
    })(),
  );
  yield* all(
    hook().opacity(0, 0.5),
    stage().opacity(1, 0.5),
    frame().scale(0.985, 0).to(1, 0.6, easeOutCubic),
  );

  // 00:04–00:10 — pre-market: the whole desk first
  yield* railHome().opacity(1, 0.4);
  yield* all(home().scale(1.08, 5.0, easeInOutCubic), home().x(-65, 5.0, easeInOutCubic));

  // 00:10–00:17 — into one symbol: the chart workspace
  sectionCode().text('02 / ON THE CHART');
  title().text('盯上一只，摊开来看。');
  yield* all(home().opacity(0, 0.45), railHome().opacity(0, 0.35), cockpit().opacity(1, 0.5));
  yield* railChart().opacity(1, 0.4);
  yield* all(cockpit().scale(1.12, 5.4, easeInOutCubic), cockpit().x(-90, 5.4, easeInOutCubic));
  yield* waitFor(0.4);

  // 00:17–00:24 — the eight-point checklist
  sectionCode().text('03 / CHECKLIST');
  title().text('买不买，先过八条硬检查。');
  yield* all(cockpit().opacity(0, 0.45), railChart().opacity(0, 0.35), sepa().opacity(1, 0.5));
  yield* railSepa().opacity(1, 0.4);
  yield* all(sepa().scale(1.08, 5.2, easeInOutCubic), sepa().x(-80, 5.2, easeInOutCubic));
  yield* waitFor(0.4);

  // 00:24–00:31 — scenarios with probabilities and triggers
  sectionCode().text('04 / SCENARIOS');
  title().text('它敢说做空，也敢说什么时候认错。');
  cockpit().scale(1.25);
  cockpit().x(-200);
  yield* all(sepa().opacity(0, 0.45), railSepa().opacity(0, 0.35), cockpit().opacity(1, 0.5));
  yield* railScenario().opacity(1, 0.4);
  yield* all(cockpit().scale(1.38, 6.2, easeInOutCubic), cockpit().x(-285, 6.2, easeInOutCubic));
  yield* waitFor(0.3);

  // 00:31–00:39 — background watch after the chart closes
  sectionCode().text('05 / BACKGROUND WATCH');
  title().text('关掉图表，它还在后台盯。');
  yield* all(railScenario().opacity(0, 0.35), followCard().opacity(1, 0.5));
  yield* all(cockpit().scale(1.46, 6.6, easeInOutCubic), cockpit().x(-320, 6.6, easeInOutCubic));
  yield* waitFor(0.4);

  // 00:39–00:43 — research becomes local files
  sectionCode().text('06 / PAPER TRAIL');
  title().text('每一步研究，落成你电脑里的文件。');
  yield* all(cockpit().opacity(0, 0.45), followCard().opacity(0, 0.4), research().opacity(1, 0.5));
  yield* railResearch().opacity(1, 0.4);
  yield* all(research().scale(1.1, 3.4, easeInOutCubic), research().x(-90, 3.4, easeInOutCubic));

  // 00:43–00:47 — the auditable local pipeline
  yield* all(stage().opacity(0, 0.5), gridOpacity(0.7, 0.5));
  yield* localFlow().opacity(1, 0.5);
  yield* sequence(
    0.18,
    flowOne().opacity(1, 0.4),
    flowTwo().opacity(1, 0.4),
    flowThree().opacity(1, 0.4),
    flowFour().opacity(1, 0.4),
  );
  yield* waitFor(1.9);
  yield* localFlow().opacity(0, 0.45);

  // 00:47–00:54 — after close: blind replay training
  sectionCode().text('07 / AFTER CLOSE');
  title().text('收盘后，遮住答案再练一次。');
  research().opacity(0);
  railResearch().opacity(0);
  trainer().opacity(1);
  yield* all(stage().opacity(1, 0.5), gridOpacity(0.45, 0.5));
  yield* railTrainer().opacity(1, 0.4);
  yield* all(trainer().scale(1.1, 5.4, easeInOutCubic), trainer().x(-90, 5.4, easeInOutCubic));
  yield* waitFor(0.4);

  // 00:54–01:02 — final position and CTA
  yield* stage().opacity(0, 0.5);
  yield* all(endCard().opacity(1, 0.6), endCard().scale(1, 0.7, easeOutCubic));
  yield* waitFor(5.6);
  yield* endCard().opacity(0, 0.5);
});

export default makeProject({
  scenes: [mainScene],
  settings: {
    shared: {
      size: { x: 1920, y: 1080 },
    },
  },
});
