// Draws each <div class="window"> as an Octavo window: a Windows title bar over a screenshot of the app.
// data-shot names the screenshot, data-width and data-height its size in CSS pixels, data-scale how large the window
// is drawn; data-dark draws a dark title bar, data-on-primary a shadow for the primary background.
// The screenshots come from the folder in ?shots= (render.ps1 passes it), or from shots/ next to this page.
const shots = new URLSearchParams(location.search).get("shots") ?? "shots/";
const controls = ['<path d="M0 5.5h10"/>', '<rect x=".5" y=".5" width="9" height="9" rx="1"/>', '<path d="M.5 .5l9 9M9.5 .5l-9 9"/>'];
for (const win of document.querySelectorAll(".window")) {
  const { shot, width, height, scale } = win.dataset;
  const dark = "dark" in win.dataset;
  const [bar, ink] = dark ? ["#1B1E22", "#E6E8EB"] : ["#F3F4F6", "#1B1F24"];
  Object.assign(win.style, {
    width: `${Math.round(width * scale)}px`,
    height: `${Math.round((+height + 32) * scale)}px`,
    borderRadius: "10px",
    overflow: "hidden",
    background: bar,
    boxShadow: "onPrimary" in win.dataset ? "0 0 0 1px rgb(255 255 255 / .10), 0 28px 72px rgb(0 0 0 / .45)" : "0 0 0 1px rgb(27 31 36 / .10), 0 24px 64px rgb(90 14 39 / .22)",
  });
  win.innerHTML = `<div style="width:${width}px;transform:scale(${scale});transform-origin:0 0">
<div style="height:32px;display:flex;align-items:center;gap:8px;padding-left:12px;color:${ink};font:12px 'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif">
<img src="icon.svg" width="16" height="16" alt=""><span>Octavo</span><span style="flex:1"></span>
${controls.map((c) => `<svg viewBox="0 0 10 10" width="10" height="10" style="margin:0 18px;fill:none;stroke:currentColor;stroke-width:1">${c}</svg>`).join("")}
</div>
<img src="${shots}${shot}" width="${width}" height="${height}" alt="" style="display:block">
</div>`;
}
