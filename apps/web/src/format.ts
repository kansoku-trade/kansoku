export const fmt = (x: number, d = 2) => x.toFixed(d);

export const signed = (x: number, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);

export const money = (x: number, d = 2) => `$${x.toFixed(d)}`;

export const upDown = (x: number) => (x >= 0 ? "up" : "down");
