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

const FETCH_EVERY = +(Deno.env.get("APP_FETCH_DELAY") ?? 5);

const getOpenPullRequests = async (
  config: BitbucketConfig,
  bulk = false
): Promise<PullRequest[]> => {
  // only fetch commit for x minutes ago
  let datetime = dayjs().subtract(FETCH_EVERY, "minutes").toISOString();
  
  if (bulk) {
    datetime = dayjs().subtract(1, "day").toISOString();
  }

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

  const pullRequests = await getOpenPullRequests(bitbucketConfig, config.bulk);

  console.log(`[${dayjs().add(7, 'hours').format()}] Found ${pullRequests.length} PR(s)`);

  if (!pullRequests?.length) return;

  // build flock message & send to flock channel
  const flockConfig: FlockConfig = {
    baseUrl: Deno.env.get("FLOCK_BASE_URL")!,
    channel: Deno.env.get("FLOCK_CHANNEL")!,
  };

  if (config.bulk) {
    let message =
      `<flockml>masih ada <b>${pullRequests.length}</b> PR yang OPEN, dibantu review ya<br>`;
    pullRequests.forEach(({ title, author, url }) => {
      message += `<a href="${url}">${title}</a> by ${author}<br/>`;
    });

    return await sendToFlock(flockConfig, message);
  }

  return await Promise.allSettled(
    pullRequests.map(async ({ title, author, url, target }) => {
      const isTargetRelease = target.split("/")[0] === "release";
      const message = await pickMessage(title, url, author, isTargetRelease);

      // in case of PR that target release branch send message twice
      // first to review channel & to normal channel
      if (isTargetRelease) {
        flockConfig.channel = Deno.env.get("FLOCK_REVIEW_CHANNEL")!;

        await sendToFlock(flockConfig, message);
      } else {
        flockConfig.channel = Deno.env.get("FLOCK_CHANNEL")!;
      }

      await sendToFlock(flockConfig, message);
    }),
  );
};

// schedule script to run every x minute
await cron(`1 */${FETCH_EVERY} * * * *`, async () => {
  console.log(`[${dayjs().add(7, 'hours').format()}] Starting PR Reminder`);

  try {
    await main();
  } catch (e) {
    console.error(`[${dayjs().add(7, 'hours').format()}] Error Happen: `, e);
  }

  console.log(`[${dayjs().add(7, 'hours').format()}] Finished PR Reminder`);
});

// schedule script to run every morning & afternoon
await cron("1 * * * * *", async () => {
  const time = dayjs().add(7, 'hours').format("HH:mm");

  if (!["09:00", "17:00"].includes(time)) return;

  console.log(`[${dayjs().add(7, 'hours').format()}] Starting Bulk PR Reminder`);

  try {
    await main({ bulk: true });
  } catch (e) {
    console.error(`[${dayjs().add(7, 'hours').format()}] Error Happen: `, e);
  }

  console.log(`[${dayjs().add(7, 'hours').format()}] Finished Bulk PR Reminder`);
});

// health check
const port = +(parse(Deno.args).port ?? Deno.env.get("APP_PORT") ?? 8000);
const handler = (_request: Request): Response => {
  return new Response("OK", { status: 200 });
};

await serve(handler, { port });
