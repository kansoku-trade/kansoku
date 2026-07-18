import { theme } from "@web/theme";
import type { DrawCmd, DrawFrame } from "./drawingsRender";

const HANDLE_RADIUS = 4;

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setDash(ctx: CanvasRenderingContext2D, dashed: boolean): void {
  ctx.setLineDash(dashed ? [5, 4] : []);
}

function paintCmd(ctx: CanvasRenderingContext2D, cmd: DrawCmd): void {
  switch (cmd.type) {
    case "segment": {
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.width;
      setDash(ctx, cmd.dashed);
      ctx.beginPath();
      ctx.moveTo(cmd.x1, cmd.y1);
      ctx.lineTo(cmd.x2, cmd.y2);
      ctx.stroke();
      return;
    }
    case "hline": {
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.width;
      setDash(ctx, cmd.dashed);
      ctx.beginPath();
      ctx.moveTo(cmd.x1, cmd.y);
      ctx.lineTo(cmd.x2, cmd.y);
      ctx.stroke();
      return;
    }
    case "rect": {
      setDash(ctx, cmd.dashed);
      ctx.fillStyle = cmd.fill;
      ctx.fillRect(cmd.x1, cmd.y1, cmd.x2 - cmd.x1, cmd.y2 - cmd.y1);
      ctx.strokeStyle = cmd.stroke;
      ctx.lineWidth = cmd.width;
      ctx.strokeRect(cmd.x1 + 0.5, cmd.y1 + 0.5, cmd.x2 - cmd.x1 - 1, cmd.y2 - cmd.y1 - 1);
      return;
    }
    case "fib": {
      setDash(ctx, cmd.dashed);
      ctx.font = "10px sans-serif";
      ctx.textBaseline = "middle";
      for (const lvl of cmd.levels) {
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = lvl.heavy ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cmd.x1, lvl.y);
        ctx.lineTo(cmd.x2, lvl.y);
        ctx.stroke();
        ctx.fillStyle = cmd.color;
        ctx.fillText(lvl.label, cmd.x2 + 4, lvl.y);
      }
      return;
    }
    case "arrow": {
      setDash(ctx, false);
      const wing = Math.PI / 7;
      const p1x = cmd.x - cmd.size * Math.cos(cmd.angle - wing);
      const p1y = cmd.y - cmd.size * Math.sin(cmd.angle - wing);
      const p2x = cmd.x - cmd.size * Math.cos(cmd.angle + wing);
      const p2y = cmd.y - cmd.size * Math.sin(cmd.angle + wing);
      ctx.beginPath();
      ctx.moveTo(cmd.x, cmd.y);
      ctx.lineTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.closePath();
      ctx.fillStyle = cmd.color;
      ctx.fill();
      return;
    }
    case "handles": {
      setDash(ctx, false);
      for (const p of cmd.points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      return;
    }
    case "measureRect": {
      setDash(ctx, false);
      ctx.fillStyle = cmd.fill;
      ctx.fillRect(cmd.x1, cmd.y1, cmd.x2 - cmd.x1, cmd.y2 - cmd.y1);
      return;
    }
    case "measureLabel":
    case "label": {
      setDash(ctx, false);
      ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
      drawRoundedRect(ctx, cmd.x, cmd.y, cmd.w, cmd.h, 4);
      ctx.fill();
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "top";
      ctx.fillStyle = theme.textPrimary;
      cmd.lines.forEach((line, i) => ctx.fillText(line, cmd.x + 8, cmd.y + 6 + i * 14));
      return;
    }
  }
}

export function paintFrame(ctx: CanvasRenderingContext2D, frame: DrawFrame): void {
  for (const cmd of frame.cmds) {
    paintCmd(ctx, cmd);
  }
  ctx.setLineDash([]);
}
