# Bitbucket PR Reminder Bot

This repo contain code for bitbucket PR reminder bot implemented using Flock
incoming webhook API.

## Requirements

- Deno 1.x
- Bitbucket account
- Flock account

## How to Setup

- Create Bitbucket app password, using guide
  [here](https://support.atlassian.com/bitbucket-cloud/docs/app-passwords)
- Create Flock incoming webhook, using guide
  [here](https://docs.flock.com/display/flockos/Create+An+Incoming+Webhook)
- Please note password & webhook id as you need that on `.env`

```bash
# clone repo
$ git clone https://github.com/dels07/pr-reminder-flock.git
$ cd pr-reminder-flock

# copy .env, please modify according to your config
$ cp .env.example .env

# install velociraptor
$ deno install -qAn vr https://deno.land/x/velociraptor@1.3.0/cli.ts
$ vr

# run
$ vr start

# for development
$ vr dev
```

You can attach vscode debugger when in development
