import { intervalTime } from "./utils.ts";
import type {
  BitbucketConfig,
  BitbucketResponse,
  Period,
  PullRequest,
} from "./types.ts";

export const getOpenPullRequests = async (
  config: BitbucketConfig,
  period: Period,
): Promise<PullRequest[]> => {
  const endpoint =
    `/repositories/mid-kelola-indonesia/talenta-core/pullrequests`;
  const { baseUrl, username, password } = config;

  const { time, interval } = period;
  const datetime = intervalTime(time, interval);

  // setup url query
  const branchNames = config.patterns.map((pattern) =>
    `source.branch.name ~ "${pattern}"`
  ).join(" OR ");
  const authorNames = config.authors;
  const query =
    `?q=state="OPEN" AND (${branchNames}) AND created_on >= ${datetime}&sort=-updated_on&pagelen=50`;

  const url = encodeURI(`${baseUrl}${endpoint}${query}`);
  const credential = btoa(`${username}:${password}`);
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

export const getWorkspaceMembers = async () => {
  //
};

export const addReviewersToPullRequest = async () => {
  //
};
