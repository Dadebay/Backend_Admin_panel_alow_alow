interface StaticAssets {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: StaticAssets;
}

// Sites requires a Worker entrypoint, but rendering remains entirely static.
// Unknown browser routes are mapped to index.html by the SPA asset setting.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
