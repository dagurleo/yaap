import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../../../", import.meta.url);
const cache = new URL("node_modules/.cache/yaap-pricing.mjs", root);
await mkdir(new URL("node_modules/.cache/", root), { recursive: true });
await build({
  entryPoints: [
    fileURLToPath(new URL("apps/web/src/features/landing/pricing.tsx", root)),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: fileURLToPath(cache),
});
const { PricingPage, PricingSection } = await import(cache.href);
const { BILLING_PLANS } = await import(
  new URL("../../../apps/web/src/lib/billing-plans.ts", import.meta.url)
);
const logo = (
  await readFile(new URL("apps/web/public/brand/logo-light.svg", root), "utf8")
)
  .replace(/<\?xml[^>]*>/g, "")
  .replace("<svg", '<svg class="brand-lockup"');
const css =
  "html,body{margin:0;padding:0}body{background:#f4f5f6}\n" +
  (
    await readFile(
      new URL("apps/web/src/features/landing/landing.css", root),
      "utf8",
    )
  ).replace("/brand/InterVariable.woff2", "/assets/InterVariable.woff2");
const script = `const plans=${JSON.stringify(BILLING_PLANS)};document.querySelectorAll('.pricing-section').forEach(section=>{const input=section.querySelector('input[type="range"]');const buttons=[...section.querySelectorAll('.pricing-stops button')];function update(index){const plan=plans[index],events=plan.eventAllowance.toLocaleString('en-US'),price='$'+plan.monthlyPriceCents/100;input.value=index;input.setAttribute('aria-valuetext',events+' events per month, '+price+' per month');section.querySelector('output').textContent=events;section.querySelector('.pricing-price > span').textContent=price;section.querySelector('.pricing-sr-only').textContent=' for '+events+' events';section.querySelector('.pricing-slider').style.setProperty('--pricing-progress',index/(plans.length-1)*100+'%');buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===Number(index))));}input.addEventListener('input',()=>update(Number(input.value)));buttons.forEach((b,i)=>b.addEventListener('click',()=>update(i)));});`;
for (const [name, component] of [
  ["page", createElement(PricingPage, { hosted: true })],
  [
    "section",
    createElement(
      "div",
      { className: "yaap-landing" },
      createElement(PricingSection, { hosted: true }),
    ),
  ],
]) {
  const html = renderToStaticMarkup(component)
    .replace(/<link[^>]*rel="preload"[^>]*>/g, "")
    .replace(/<img[^>]*src="\/brand\/logo-light.svg"[^>]*\/>/g, logo);
  const staticHtml = html
    .replace(/<output[^>]*>/g, '<span class="pricing-event-count">')
    .replace(/<\/output>/g, "</span>")
    .replace(/<details>/g, '<div class="pricing-faq-item">')
    .replace(/<\/details>/g, "</div>")
    .replace(/<summary>/g, '<div class="pricing-faq-summary">')
    .replace(/<\/summary>/g, "</div>");
  const staticCss =
    css +
    '\n.yaap-landing .faq .pricing-faq-item{border-bottom:1px solid #262c3214;padding:14px 0;font-size:14px}.yaap-landing .pricing-faq-item p{display:none}.yaap-landing .pricing-faq-summary{display:flex;justify-content:space-between;gap:20px}.yaap-landing .pricing-volume .pricing-event-count{color:#262c32}.mobile-menu .pricing-faq-summary:after{display:none}.pricing-faq-summary:after{content:"+"}@media(max-width:500px){.yaap-landing .faq .pricing-faq-item{font-size:16px}}';
  await writeFile(
    new URL(name + "-source.json", import.meta.url),
    JSON.stringify({ html: staticHtml, css: staticCss }, null, 2),
  );
  const localCss = css.replace(
    "/assets/InterVariable.woff2",
    "../yaap-v1/assets/InterVariable.woff2",
  );
  await writeFile(
    new URL(name + ".html", import.meta.url),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yaap pricing design preview</title><style>' +
      localCss +
      "</style></head><body>" +
      html +
      "<script>" +
      script +
      "</script></body></html>",
  );
}
await rm(cache);
