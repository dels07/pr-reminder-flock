import dayjs from "https://deno.land/x/dayjs@v1.10.7/mod.ts";
import { cron } from "https://deno.land/x/deno_cron@v1.0.0/mod.ts";

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
  values: PullRequestsResult[],
  page: number;
  size: number;
}

type PullRequestsResult = {
  title: string;
  author: { display_name: string };
  links: { self: { href: string }};
}

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
  ).join("OR");
  const authorNames = config.authors.map((pattern) =>
    `author.display_name ~ "${pattern}"`
  ).join("OR");
  const query =
    `?q=state="OPEN" AND (${branchNames}) AND (${authorNames}) AND updated_on>=${datetime}&sort=-updated_on&pagelen=50`;

  const url = encodeURI(`${config.baseUrl}${config.endpoint}${query}`);
  const credential = btoa(`${config.username}:${config.password}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${credential}`,
      "Accept": "application/json",
    },
  });
  const json: BitbucketResponse = await res.json();

  // filter & map open pull requests
  const pullRequests = json.values.map(({ title, author, links }) => {
    return {
      title: title,
      author: author.display_name,
      url: links.self.href,
    };
  });

  return pullRequests;
};

const sendToFlock = async (config: FlockConfig, message: string) => {
  const res = await fetch(`${config.baseUrl}/${config.channel}`, {
    method: "POST",
    body: JSON.stringify(message),
  });

  return res.json();
};

const pickMessage = (title: string, url: string, author: string): string => {
  const greeters = [
    "tolong bantu review PR ini ya",
    "masi butuh yang ijo-ijo nih gan",
    "sundul gan",
    "bantu up review yang ini donk",
    "+1 anda akan sangat membantu",
    "approval ijo, asiknya rame-rame",
  ];
  const idx = Math.floor(Math.random() * greeters.length);
  const greeter = greeters[idx];

  const message =
    `<flockml>${greeter} <a href="${url}">${title} by ${author}</a></flockml>`;

  return message;
};

const main = async () => {
  // grab list of PR that need to be review
  const bitbucketConfig = {
    baseUrl: Deno.env.get("BITBUCKET_BASE_URL")!,
    endpoint: `/repositories/mid-kelola-indonesia/talenta-core/pullrequests`,
    username: Deno.env.get("BITBUCKET_USERNAME")!,
    password: Deno.env.get("BITBUCKET_PASSWORD")!,
    patterns: Deno.env.get("PR_INITIAL")!.split(","),
    authors: Deno.env.get("PR_AUTHORS")!.split(","),
  };

  const pullRequests = await getOpenPullRequests(bitbucketConfig);

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
await cron(`* */${FETCH_EVERY} * * * *`, async () => {
  await main();
});
