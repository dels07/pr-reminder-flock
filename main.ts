import dayjs from "https://deno.land/x/deno_dayjs@v0.0.3/mod.ts";
import { cron } from "https://deno.land/x/deno_cron@v1.0.0/cron.ts";
import "https://deno.land/x/dotenv/load.ts";

type PullRequest = {
  title: string;
  author: string;
  url: string;
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
};

type FlockConfig = {
  baseUrl: string;
  channel: string;
};

const FETCH_EVERY = 5;

const getOpenPullRequests = async (
  config: BitbucketConfig,
): Promise<PullRequest[]> => {
  // only fetch commit for x minutes ago
  const datetime = dayjs().subtract(FETCH_EVERY, "minutes").toISOString();

  // setup url query
  const branchNames = config.patterns.map((pattern) =>
    `source.branch.name ~ "${pattern}"`
  ).join(" OR ");
  const authorNames = config.authors;
  const query =
    `?q=state="OPEN" AND (${branchNames}) AND updated_on >= ${datetime}&sort=-updated_on&pagelen=50`;

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
    .map(({ title, author, links }) => {
      return {
        title: title,
        author: author.display_name,
        url: links.html.href,
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

const pickMessage = (title: string, url: string, author: string): string => {
  const greeters = [
    "tolong bantu review PR ini ya",
    "masi butuh yang ijo-ijo nih gan",
    "sundul gan",
    "bantu up review yang ini donk",
    "+1 anda akan sangat membantu",
    "approval ijo, asiknya rame-rame",
    "belum tau asiknya, klo belum pencet approve",
    "yuk review yuk",
    "up lapak",
    "berikut ini butuh review, fakta no 5 mencengangkan",
    "review ya mumpung masi anget",
    "di review dulu, sebelum kadaluarsa",
  ];
  const idx = Math.floor(Math.random() * greeters.length);
  const greeter = greeters[idx];

  const message =
    `<flockml>${greeter}<br/><a href="${url}">${title}</a> by ${author}</flockml>`;

  return message;
};

const main = async () => {
  // grab list of PR that need to be review
  const bitbucketConfig = {
    baseUrl: Deno.env.get("BITBUCKET_BASE_URL")!,
    endpoint: `/repositories/mid-kelola-indonesia/talenta-core/pullrequests`,
    username: Deno.env.get("BITBUCKET_USERNAME")!,
    password: Deno.env.get("BITBUCKET_PASSWORD")!,
    patterns: Deno.env.get("PR_PATTERNS")!.split(","),
    authors: Deno.env.get("PR_AUTHORS")!.split(","),
  };

  const pullRequests = await getOpenPullRequests(bitbucketConfig);

  console.log(`[${dayjs().format()}] Found ${pullRequests.length} PR(s)`);

  if (!pullRequests?.length) return;

  // build flock message & send to flock channel
  const flockConfig: FlockConfig = {
    baseUrl: Deno.env.get("FLOCK_BASE_URL")!,
    channel: Deno.env.get("FLOCK_CHANNEL")!,
  };

  await Promise.allSettled(pullRequests.map(async ({ title, author, url }) => {
    const message = pickMessage(title, url, author);

    await sendToFlock(flockConfig, message);
  }));
};

// schedule script to run every x minute
await cron(`1 */${FETCH_EVERY} * * * *`, async () => {
  console.log(`[${dayjs().format()}] Starting PR Reminder`);

  await main();

  console.log(`[${dayjs().format()}] Finished PR Reminder`);
});