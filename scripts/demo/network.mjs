import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(
  process.env.DEMO_PROXY
    ? new EnvHttpProxyAgent({
        pipelining: 0,
        httpProxy: process.env.DEMO_PROXY,
        httpsProxy: process.env.DEMO_PROXY,
        noProxy: "localhost,127.0.0.1,::1",
      })
    : new Agent({ pipelining: 0 }),
);
