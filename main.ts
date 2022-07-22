import dayjs from "https://deno.land/x/deno_dayjs/mod.ts";
import { cron } from "https://deno.land/x/deno_cron/cron.ts";
import { serve } from "https://deno.land/std/http/server.ts";
import { parse } from "https://deno.land/std/flags/mod.ts";
import "https://deno.land/x/dotenv/load.ts";

type PullRequest = {
  title: string;
  author: string;
  url: string;
  target: string;
};

type BitbucketConfig = {
  baseUrl: string;
  endpoint: string;
  username: string;
  password: string;
  patterns: string[];
  authors: string[];
};

type BitbucketResponse = {
  pagelen: number;
  values: PullRequestsResult[];
  page: number;
  size: number;
};

type PullRequestsResult = {
  title: string;
  author: { display_name: string };
  links: { html: { href: string } };
  destination: { branch: { name: string } };
};

type FlockConfig = {
  baseUrl: string;
  channel: string;
};

type Period = {
  time: number;
  interval: string;
};

const FETCH_DELAY = +(Deno.env.get("APP_FETCH_DELAY") ?? 5);
const FETCH_INTERVAL = Deno.env.get("APP_FETCH_INTERVAL") ?? "minutes";
const BULK_DELAY = +(Deno.env.get("APP_BULK_DELAY") ?? 1);
const BULK_INTERVAL = Deno.env.get("APP_BULK_INTERVAL") ?? "day";

const getOpenPullRequests = async (
  config: BitbucketConfig,
  period: Period,
): Promise<PullRequest[]> => {
  const { time, interval } = period;
  const datetime = dayjs().subtract(time, interval).toISOString();

  // setup url query
  const branchNames = config.patterns.map((pattern) =>
    `source.branch.name ~ "${pattern}"`
  ).join(" OR ");
  const authorNames = config.authors;
  const query =
    `?q=state="OPEN" AND (${branchNames}) AND created_on >= ${datetime}&sort=-updated_on&pagelen=50`;

  const url = encodeURI(`${config.baseUrl}${config.endpoint}${query}`);
  const credential = btoa(`${config.username}:${config.password}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${credential}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });
  const json: BitbucketResponse = await res.json();

  if (!json || !json?.values) {
    return [];
  }

  // filter & map open pull requests
  const pullRequests = json.values
    .filter(({ author }) => authorNames.includes(author.display_name))
    .map(({ title, author, links, destination }) => {
      return {
        title: title,
        author: author.display_name,
        url: links.html.href,
        target: destination.branch.name,
      };
    });

  return pullRequests;
};

const sendToFlock = async (config: FlockConfig, message: string) => {
  const res = await fetch(`${config.baseUrl}/${config.channel}`, {
    method: "POST",
    body: JSON.stringify({ flockml: message }),
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  const json = await res.json();

  return json;
};

const pickMessage = async (
  title: string,
  url: string,
  author: string,
  isTargetRelease = false,
): Promise<string> => {
  if (isTargetRelease) {
    const message =
      `<flockml>minta tolong review ya<br/><a href="${url}">${title}</a> by ${author}</flockml>`;

    return message;
  }

  const greetersFile = await Deno.readTextFile("./greeters.txt");
  const greeters = greetersFile.split("\n");
  const idx = Math.floor(Math.random() * greeters.length);
  const greeter = greeters[idx];

  const message =
    `<flockml>${greeter}<br/><a href="${url}">${title}</a> by ${author}</flockml>`;

  return message;
};

const pickBulkMessage = (greeter: string, pullRequests: PullRequest[]) => {
  const links = pullRequests.map(({ title, author, url }) =>
    `<a href="${url}">${title}</a> by ${author}`
  ).join("<br/>");
  const message = `<flockml>${greeter}<br/>${links}</flockml>`;

  return message;
};

const jakartaTime = () => {
  return dayjs().add(7, "hours").format();
};

const main = async (config = { bulk: false }) => {
  // grab list of PR that need to be review
  const bitbucketConfig = {
    baseUrl: Deno.env.get("BITBUCKET_BASE_URL")!,
    endpoint: `/repositories/mid-kelola-indonesia/talenta-core/pullrequests`,
    username: Deno.env.get("BITBUCKET_USERNAME")!,
    password: Deno.env.get("BITBUCKET_PASSWORD")!,
    patterns: Deno.env.get("PR_PATTERNS")!.split(","),
    authors: Deno.env.get("PR_AUTHORS")!.split(","),
  };

  const period = { time: FETCH_DELAY, interval: FETCH_INTERVAL };

  if (config.bulk) {
    period.time = BULK_DELAY;
    period.interval = BULK_INTERVAL;
  }

  const pullRequests = await getOpenPullRequests(bitbucketConfig, period);

  console.log(
    `[${jakartaTime()}] Found ${pullRequests.length} PR(s)`,
  );

  if (!pullRequests?.length) return;

  // build flock message & send to flock channel
  const flockConfig: FlockConfig = {
    baseUrl: Deno.env.get("FLOCK_BASE_URL")!,
    channel: Deno.env.get("FLOCK_CHANNEL")!,
  };

  const flockConfigRelease = {
    ...flockConfig,
    channel: Deno.env.get("FLOCK_REVIEW_CHANNEL")!,
  };

  if (config.bulk) {
    const message = pickBulkMessage(
      `masih ada <b>${pullRequests.length}</b> PR yang OPEN, dibantu review ya`,
      pullRequests,
    );

    sendToFlock(flockConfig, message);

    const releases = pullRequests.filter(({ target }) =>
      target.search("master|release") !== -1
    );

    if (!releases?.length) return;

    const messageRelease = pickBulkMessage(
      `tolong bantu review PR utk release ya`,
      releases,
    );

    sendToFlock(flockConfigRelease, messageRelease);

    return;
  }

  return await Promise.allSettled(
    pullRequests.map(async ({ title, author, url, target }) => {
      if (target.search("master|release") !== -1) {
        const message = await pickMessage(title, url, author, true);

        await sendToFlock(flockConfigRelease, message);
      }

      const message = await pickMessage(title, url, author);

      await sendToFlock(flockConfig, message);
    }),
  );
};

// schedule script to run every x minute
await cron(`1 */${FETCH_DELAY} * * * *`, async () => {
  console.log(`[${jakartaTime()}] Starting PR Reminder`);

  try {
    await main();
  } catch (e) {
    console.error(`[${jakartaTime()}] Error Happen: `, e);
  }

  console.log(`[${jakartaTime()}] Finished PR Reminder`);
});

// schedule script to run every morning & afternoon
await cron("1 * * * * *", async () => {
  const time = dayjs().add(7, "hours").format("HH:mm");
  const day = dayjs().add(7, "hours").format("ddd");

  const scheduleTimes = Deno.env.get("APP_BULK_SCHEDULE")!.split(",");

  if (!scheduleTimes.includes(time) || ["Sun", "Sat"].includes(day)) return;

  console.log(
    `[${jakartaTime()}] Starting Bulk PR Reminder`,
  );

  try {
    await main({ bulk: true });
  } catch (e) {
    console.error(`[${jakartaTime()}] Error Happen: `, e);
  }

  console.log(
    `[${jakartaTime()}] Finished Bulk PR Reminder`,
  );
});

// health check
const port = +(parse(Deno.args).port ?? Deno.env.get("APP_PORT") ?? 8000);
const handler = (_request: Request): Response => {
  return new Response("OK", { status: 200 });
};

await serve(handler, { port });
