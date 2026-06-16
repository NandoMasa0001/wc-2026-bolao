/**
 * Cloudflare Worker — dispara o GitHub Actions workflow `fetch-results.yml`
 * a cada 15 minutos.
 *
 * Por que existe: GH Actions schedule cron é throttled forte no free tier
 * (gaps de 30 min – 5h em dias movimentados). workflow_dispatch via API
 * sempre roda na hora. Aqui o Cloudflare é o "cron confiável" que aciona
 * o workflow, e o workflow segue rodando no GH (com nossos secrets).
 *
 * Setup:
 *   1. Crie um GitHub PAT (fine-grained) com permissão Actions: Write no
 *      repo wc-2026-bolao. Cópia em https://github.com/settings/personal-access-tokens
 *   2. `cd scripts/cron-worker && npx wrangler login`
 *   3. `npx wrangler secret put GH_PAT` — cola o token
 *   4. `npx wrangler deploy`
 */
export default {
  async scheduled(event, env, ctx) {
    const url = 'https://api.github.com/repos/NandoMasa0001/wc-2026-bolao/actions/workflows/fetch-results.yml/dispatches';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bolao-cron-worker'
      },
      body: JSON.stringify({ ref: 'main' })
    });
    if (!r.ok) {
      const body = await r.text();
      console.error(`workflow_dispatch failed: ${r.status} — ${body}`);
    } else {
      console.log('triggered fetch-results.yml');
    }
  },

  // Permite teste manual via HTTP: visitar a URL do worker dispara o cron
  // imediatamente. Útil pra debug pós-deploy.
  async fetch(request, env, ctx) {
    await this.scheduled(null, env, ctx);
    return new Response('triggered\n');
  }
};
