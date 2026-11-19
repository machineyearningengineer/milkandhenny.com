import { defineRailway, github, project, service } from "railway/iac";
// Railway settings for the production services built from this repository
// (replaces railway.toml). Railway does not read this file on deploy. Change
// settings with:
//   npm ci --prefix .railway && railway config plan && railway config apply
// The Postgres database and its volume are not declared, so this file never
// touches them. Variables are not managed here either.
// See docs/deployment.md and
// https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "milkandhenny.com";
export default defineRailway(() => {
  const repo = github("KingPsychopath/milkandhenny.com", {
    branch: "main",
    checkSuites: false,
  });

  // web and media-worker run the same Docker image; their variables decide
  // which role the process takes.
  const app: Parameters<typeof service>[1] = {
    source: repo,
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: [
        "src/**",
        "features/**",
        "components/**",
        "lib/**",
        "server/**",
        "public/**",
        "runtime-assets/**",
        "scripts/check-native-dropdowns.mjs",
        "scripts/copy-excalidraw-fonts.mjs",
        "scripts/copy-hot-and-cold-assets.mjs",
        "scripts/fetch-semantic-model.ts",
        "ops/**",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "Dockerfile",
        ".dockerignore",
        "postcss.config.mjs",
        "tsconfig.json",
        "tsconfig.cli.json",
        "vite.config.ts",
      ],
    },
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    replicas: { "europe-west4-drams3a": 1 },
    deploy: {
      // Restart on failure is Railway's default policy, so it is not declared:
      // Railway does not store defaults and the plan would never settle.
      restartPolicyMaxRetries: 3,
    },
  };

  const web = service("web", {
    ...app,
    domains: ["milkandhenny.com", "www.milkandhenny.com"],
  });
  const mediaWorker = service("media-worker", app);

  // Nightly pg_dump to R2. Deployed with `railway up` from backup/, so it has
  // no repository source. See docs/backups.md.
  const postgresBackup = service("postgres-backup", {
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { cronSchedule: "15 3 * * *", restartPolicyType: "NEVER" },
  });

  return project("milkandhenny", {
    variables: { managed: false },
    resources: [web, mediaWorker, postgresBackup],
  });
});
