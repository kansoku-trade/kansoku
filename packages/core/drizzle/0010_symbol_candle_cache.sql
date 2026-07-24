CREATE TABLE `symbol_candle_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`timeframes` text NOT NULL,
	`day_kline` text,
	`last_fetch_at` integer NOT NULL,
	`updated_at` text NOT NULL
);
