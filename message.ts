import { isTargetRelease } from "./utils.ts";
import type { PullRequest } from "./types.ts";

export const pickMessage = async (
  pullRequest: PullRequest,
): Promise<string> => {
  const { url, title, author, target } = pullRequest;

  if (isTargetRelease(target)) {
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

export const pickBulkMessage = (
  greeter: string,
  pullRequests: PullRequest[],
): string => {
  const links = pullRequests.map(({ title, author, url }) =>
    `<a href="${url}">${title}</a> by ${author}`
  ).join("<br/>");
  const message = `<flockml>${greeter}<br/>${links}</flockml>`;

  return message;
};
