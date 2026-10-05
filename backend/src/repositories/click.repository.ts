import { Pool } from "pg";
import { AnalyticsDTO } from "../types/url.types";

// Both tiers are normalised to src(ts, country, "referrerHost", device, n) so the rest is shared.
// Everything is UTC: `AT TIME ZONE 'UTC'` turns timestamptz into UTC wall-clock time, and the
// date params ($2 from, $3 to, inclusive of the whole day) are read as UTC midnights.
// '' is the "unknown" sentinel in both tables (raw NULLs are coalesced), mapped back to null in the output.
const RAW_SRC = `
  SELECT date_trunc('hour', "clickedAt" AT TIME ZONE 'UTC') AS ts,
         coalesce(country, '') AS country, coalesce("referrerHost", '') AS "referrerHost", device, 1 AS n
  FROM clicks
  WHERE "urlId" = $1
    AND "clickedAt" >= $2::date::timestamp AT TIME ZONE 'UTC'
    AND "clickedAt" < ($3::date + 1)::timestamp AT TIME ZONE 'UTC'`;

const DAILY_SRC = `
  SELECT day::timestamp AS ts, country, "referrerHost", device, count AS n
  FROM clicks_daily
  WHERE "urlId" = $1 AND day BETWEEN $2::date AND $3::date`;

const top = (col: string) => `(
  SELECT coalesce(json_agg(x), '[]'::json) FROM (
    SELECT nullif(${col}, '') AS value, sum(n)::int AS count FROM src GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10
  ) x)`;

const query = (src: string, step: string, fmt: string) => `
  WITH src AS (${src}),
  series AS (SELECT generate_series($2::date::timestamp, ($3::date + 1)::timestamp - interval '${step}', interval '${step}') AS ts)
  SELECT
    (SELECT coalesce(sum(n), 0)::int FROM src) AS total,
    (SELECT coalesce(json_agg(json_build_object('t', to_char(s.ts, '${fmt}'), 'count', coalesce(b.n, 0)) ORDER BY s.ts), '[]'::json)
       FROM series s LEFT JOIN (SELECT ts, sum(n)::int AS n FROM src GROUP BY ts) b USING (ts)) AS series,
    ${top("country")} AS countries,
    ${top('"referrerHost"')} AS referrers,
    ${top("device")} AS devices`;

// Raw clicks are kept 30 days and allow hourly detail; the daily rollup keeps long ranges cheap.
const SQL = {
  hour: query(RAW_SRC, "1 hour", 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  day: query(DAILY_SRC, "1 day", "YYYY-MM-DD"),
};

export class ClickRepository {
  constructor(private db: Pool) {}

  async analytics(urlId: number, from: string, to: string, granularity: "hour" | "day"): Promise<AnalyticsDTO> {
    const { rows } = await this.db.query(SQL[granularity], [urlId, from, to]);
    return { from, to, granularity, ...rows[0] };
  }
}
