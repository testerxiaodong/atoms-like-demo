import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
// Opt-in local network configuration only; never retry requests or change assertions.
// Bypass proxies for the local application server.
setGlobalDispatcher(
  process.env.CLOUD_TEST_PROXY
    ? new EnvHttpProxyAgent({
        pipelining: 0,
        httpProxy: process.env.CLOUD_TEST_PROXY,
        httpsProxy: process.env.CLOUD_TEST_PROXY,
        noProxy: "localhost,127.0.0.1,::1",
      })
    : new Agent({ pipelining: 0 }),
);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  try {
    return await nativeFetch(...args);
  } catch (error) {
    console.error("[cloud transport]", error.cause?.code ?? error.name);
    throw error;
  }
};
