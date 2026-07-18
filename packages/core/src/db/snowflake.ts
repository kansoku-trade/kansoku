export const SNOWFLAKE_EPOCH_MS = 1735689600000;

const SEQUENCE_BITS = 12n;
const SEQUENCE_MASK = 4095;

let lastTimestamp = -1;
let sequence = 0;

export function nextSnowflake(now: () => number = Date.now): string {
  let timestamp = now();
  if (timestamp < lastTimestamp) timestamp = lastTimestamp;

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) & SEQUENCE_MASK;
    if (sequence === 0) while (timestamp <= lastTimestamp) timestamp = now();
  } else {
    sequence = 0;
  }

  lastTimestamp = timestamp;
  const value = (BigInt(timestamp - SNOWFLAKE_EPOCH_MS) << SEQUENCE_BITS) | BigInt(sequence);
  return String(value);
}

export function snowflakeToDate(id: string): Date {
  const timestamp = (BigInt(id) >> SEQUENCE_BITS) + BigInt(SNOWFLAKE_EPOCH_MS);
  return new Date(Number(timestamp));
}
