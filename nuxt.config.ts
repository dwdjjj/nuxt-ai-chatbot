// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  pages: true,
  runtimeConfig: {
    openaiApiKey: process.env.CF_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    public: {},
  },

  modules: ["@nuxtjs/tailwindcss"],
});
