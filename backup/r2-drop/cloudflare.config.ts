// @ts-nocheck: this Worker has its own workspace; the root typecheck cannot resolve its packages.
import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "milkandhenny-backup-drop",
    entrypoint: "worker.js",
    compatibilityDate: "2026-11-01",
    workersDev: true,
    previewUrls: false,
    observability: { enabled: true },
    env: {
      BACKUPS: bindings.r2({ name: "milkandhenny-backups" }),
      BACKUP_DROP_TOKEN: bindings.secret(),
    },
  },
});
