# Weekly Watch — launchd 安装说明

每周一早上 09:00（本地时间）自动跑 `scripts/weekly-watch.py`，把市场温度、AI 主线本周走势、5 项量化阈值警报、近期财报倒计时写到 `journal/YYYY-MM-DD-weekly-watch.md`。

> 为什么选周一 09:00 本地：CST 周一 09:00 = ET 周日 21:00。美股周末闭市，数据冻结在上周五收盘。早晨打开 journal 就能看到「上周已发生」+「本周财报预告」，一周的观察节奏从这一份开始。

> 想周末看？把 Weekday 改成 7（周日）或 6（周六）。想美股开盘日看？把 Weekday 改成 2（周二），早晨能看到上周完整 + 本周第一天行情。

---

## 一次性手动验证

先验证脚本本身能跑通（不写 journal）：

```bash
cd ~/git/trade
python3 .claude/skills/market-session-tracker/scripts/weekly-watch.py --smoke
# 期望: {"ok": true, ...} 含市场温度
```

再跑一次完整流程（写 journal）：

```bash
python3 .claude/skills/market-session-tracker/scripts/weekly-watch.py
# 期望: ✓ wrote journal/YYYY-MM-DD-weekly-watch.md
#       flags fired: N — 三同跌, ...
```

打开生成的 journal 文件确认内容正确：

```bash
ls -lt journal/*-weekly-watch.md | head -1
```

---

## 安装 launchd（自动每周跑）

```bash
# 1. 复制模板到 LaunchAgents，并替换 __REPO_ROOT__ 为真实路径
sed "s|__REPO_ROOT__|$HOME/git/trade|g" \
  .claude/skills/market-session-tracker/launchd/dev.innei.trade.weekly-watch.plist \
  > ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist

# 2. 加载到 launchd
launchctl load ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist

# 3. 验证已注册（应该能看到 dev.innei.trade.weekly-watch）
launchctl list | grep weekly-watch
```

---

## 临时手动触发一次（测试 launchd 是否真能拉起）

```bash
launchctl start dev.innei.trade.weekly-watch
# 然后看输出日志
tail -50 .claude/skills/market-session-tracker/launchd/weekly-watch.stdout.log
tail -50 .claude/skills/market-session-tracker/launchd/weekly-watch.stderr.log
```

---

## 修改触发时间

编辑 `~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist` 的 `StartCalendarInterval`，然后重新加载：

```bash
launchctl unload ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist
launchctl load ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist
```

`Weekday` 取值：`0` 或 `7` = 周日，`1` = 周一，`2` = 周二，...，`6` = 周六。

---

## 卸载

```bash
launchctl unload ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist
rm ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist
```

---

## 故障排查

| 症状 | 检查 |
|---|---|
| `launchctl list` 没看到 weekly-watch | plist 路径或语法错误。`plutil ~/Library/LaunchAgents/dev.innei.trade.weekly-watch.plist` 验证 |
| stderr.log 出现 `longbridge: command not found` | `EnvironmentVariables.PATH` 没包含 longbridge 二进制路径。`which longbridge` 找到路径加进去 |
| stderr.log 出现 connect timeout | 长桥 API 临时故障。脚本内置 2 次重试，仍失败则当周跳过即可 |
| 输出的 journal 文件没生成 | 检查 `--no-write` 是否误传；检查 `journal/` 目录权限 |
| Mac 睡眠时错过触发 | launchd 默认不会唤醒系统执行。需要在「系统设置 → 节能」里加唤醒计划，或接受偶尔错过 |

---

## 脚本逻辑速查

`weekly-watch.py` 检查 5 项**可自动测**的阈值：

1. **市场温度 > 85（狂热）或 < 25（恐慌）** — 长桥读数
2. **VXX > 35** — 真恐慌阈值
3. **SPY 距 50 日高点 > -10%** — 大盘进入修正
4. **MAGS + MU + SMH 本周同步下跌** — 区分轮动 vs 系统性的关键
5. **关键财报倒计时** — NVDA / MU / MSFT / META / GOOG / AMZN 下次电话会日期

剩下 4 项**只能人工查**（脚本里只留提醒）：

- 超大厂投资级债券利差（要 FRED）
- DRAM 杠杆 ETF AUM（要 issuer 页）
- Samsung/SK 海力士消费级 DRAM 产能新闻
- 超大厂 CFO 对 AI ROI 的措辞（财报季实际听电话会）

完整 11 信号清单见 `memory/project-ai-memory-cycle-top-signals.md`。
