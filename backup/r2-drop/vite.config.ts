// @ts-nocheck: this Worker has its own workspace; the root typecheck cannot resolve its packages.
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [cloudflare()] });
