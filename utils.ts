import dayjs from "https://deno.land/x/deno_dayjs/mod.ts";

export const jakartaTime = (): string => {
  return dayjs().add(7, "hours").format();
};

export const intervalTime = (time: number, interval: string): string => {
  return dayjs().subtract(time, interval).toISOString();
};

export const writeLog = (message: string): void => {
  console.log(`[${jakartaTime()}] ${message}`);
};

export const isTargetRelease = (targetBranch: string): boolean => {
  return targetBranch.split("/")[0] === "release";
};
