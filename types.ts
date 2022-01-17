export type PullRequest = {
  title: string;
  author: string;
  url: string;
  target: string;
};

export type BitbucketConfig = {
  baseUrl: string;
  username: string;
  password: string;
  patterns: string[];
  authors: string[];
};

export type BitbucketResponse = {
  pagelen: number;
  values: PullRequestsResult[];
  page: number;
  size: number;
};

export type PullRequestsResult = {
  title: string;
  author: { display_name: string };
  links: { html: { href: string } };
  destination: { branch: { name: string } };
};

export type FlockConfig = {
  baseUrl: string;
  channel: string;
};

export type Period = {
  time: number;
  interval: string;
};
