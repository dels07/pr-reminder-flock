import dayjs from "deno_dayjs";
import { cron } from "deno_cron";
import { serve } from "http/server.ts";
import { parse } from "flags/mod.ts";
import "dotenv";

import { getOpenPullRequests } from "./bitbucket.ts";
import { isTargetRelease, writeLog } from "./utils.ts";
import { sendToFlock } from "./flock.ts";
import { pickBulkMessage, pickMessage } from "./message.ts";
import type { BitbucketConfig, FlockConfig } from "./types.ts";

const FETCH_DELAY = +(Deno.env.get("APP_FETCH_DELAY") ?? 5);
const FETCH_INTERVAL = Deno.env.get("APP_FETCH_INTERVAL") ?? "minutes";
const BULK_DELAY = +(Deno.env.get("APP_BULK_DELAY") ?? 1);
const BULK_INTERVAL = Deno.env.get("APP_BULK_INTERVAL") ?? "day";
const BITBUCKET_CONFIG: BitbucketConfig = {
  baseUrl: Deno.env.get("BITBUCKET_BASE_URL")!,
  username: Deno.env.get("BITBUCKET_USERNAME")!,
  password: Deno.env.get("BITBUCKET_PASSWORD")!,
  patterns: Deno.env.get("PR_PATTERNS")!.split(","),
  authors: Deno.env.get("PR_AUTHORS")!.split(","),
};
const FLOCK_CONFIG: FlockConfig = {
  baseUrl: Deno.env.get("FLOCK_BASE_URL")!,
  channel: Deno.env.get("FLOCK_CHANNEL")!,
};
const FLOCK_CONFIG_RELEASE: FlockConfig = {
  ...FLOCK_CONFIG,
  channel: Deno.env.get("FLOCK_REVIEW_CHANNEL")!,
};

const handleSingleReminder = async () => {
  const period = { time: FETCH_DELAY, interval: FETCH_INTERVAL };
  const pullRequests = await getOpenPullRequests(BITBUCKET_CONFIG, period);

  return await Promise.allSettled(
    pullRequests.map(async (pullRequest) => {
      if (isTargetRelease(pullRequest.target)) {
        const message = await pickMessage(pullRequest);

        await sendToFlock(FLOCK_CONFIG_RELEASE, message);
      }

      const message = await pickMessage(pullRequest);

      await sendToFlock(FLOCK_CONFIG, message);
    }),
  );
};

const handleBulkReminder = async () => {
  const period = { time: BULK_DELAY, interval: BULK_INTERVAL };

  const pullRequests = await getOpenPullRequests(BITBUCKET_CONFIG, period);
  const message = pickBulkMessage(
    `masih ada <b>${pullRequests.length}</b> PR yang OPEN, dibantu review ya`,
    pullRequests,
  );

  sendToFlock(FLOCK_CONFIG, message);
};

// schedule script to run every x minute
await cron(`1 */${FETCH_DELAY} * * * *`, async () => {
  writeLog(`Starting PR Reminder`);

  try {
    await handleSingleReminder();
  } catch (e) {
    writeLog(`Error Happen: ${e}`);
  }

  writeLog(`Finished PR Reminder`);
});

// schedule script to run every morning & afternoon
await cron("1 * * * * *", async () => {
  const time = dayjs().add(7, "hours").format("HH:mm");
  const scheduleTimes = Deno.env.get("APP_BULK_SCHEDULE")!.split(",");

  if (!scheduleTimes.includes(time)) return;

  writeLog(`Starting Bulk PR Reminder`);

  try {
    await handleBulkReminder();
  } catch (e) {
    writeLog(`Error Happen: ${e}`);
  }

  writeLog(
    `Finished Bulk PR Reminder`,
  );
});

// health check
const port = +(parse(Deno.args).port ?? Deno.env.get("APP_PORT") ?? 8000);
const handler = (_request: Request): Response => {
  return new Response("OK", { status: 200 });
};

await serve(handler, { port });
