import type { FlockConfig } from "./types.ts";

export const sendToFlock = async (config: FlockConfig, message: string) => {
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
