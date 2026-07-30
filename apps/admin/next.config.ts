import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(adminRoot, "../..");
const isNodeDeployment = process.env.ALOWALOW_DEPLOY_TARGET === "node";

const nextConfig: NextConfig = {
  ...(isNodeDeployment
    ? {
        output: "standalone",
        outputFileTracingRoot: repositoryRoot,
        typescript: {
          tsconfigPath: "tsconfig.node.json",
        },
        turbopack: {
          root: repositoryRoot,
        },
      }
    : {}),
};

export default nextConfig;
