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

# How to Deploy in Heroku

Assuming that you already registered in Heroku and you can link your github
account to Heroku

1. Fork this repo to your personal github account
2. Go to heroku [dashboard](https://dashboard.heroku.com/apps)
3. Create a new project by clicking `New -> Create new app`
4. Select a name for project, can be anything
5. In your new project, go to `Settings`
6. In `Config Vars` section, you need to add environment variables from
   `.env.example`
7. In `Buildpack` section, you need to add custom buildpack
   https://github.com/chibat/heroku-buildpack-deno
8. After all setup complete you can try to deploy your project in `Deploy`
   section

If you prefer not to link your github account and use cli to deploy, remember to modify environment values in `app.json`

```bash
# install heroku cli
$ brew install heroku

# heroku login, using browser
$ heroku login

# create a new project using custom buildpack
$ heroku apps:create --buildpack https://github.com/chibat/heroku-buildpack-deno.git pr-reminder-flock

# deploy
$ heroku git:remote --app pr-reminder-flock

# redeploy, after commit
$ git push heroku master
```
