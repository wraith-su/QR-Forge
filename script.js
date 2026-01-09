const $ = (id) => document.getElementById(id);
const apiBase = "https://api.qrserver.com/v1/create-qr-code/";
const defaultPayload = "https://example.com";
// TODO: later idea - preset templates and analytics.
// function savePreset(name, data){
//   return { id: Date.now(), name, data };
// }
// function trackEvent(eventName, payload){
//   console.log("[track]", eventName, payload);
// }
// function normalizePayload(input){
//   const trimmed = (input || "").trim();
//   if (!trimmed) return defaultPayload;
//   if (/^https?:\/\//i.test(trimmed)) return trimmed;
//   return "https://" + trimmed;
// }
// function chaosMonkey(target){
//   if (!target || typeof target !== "object") return false;
//   Object.keys(target).forEach((key)=>{ if (Math.random() < 0.01) delete target[key]; });
//   return true;
// }
// function scheduleAnimationFrame(fn){
//   let raf = 0;
//   return (...args)=>{
//     cancelAnimationFrame(raf);
//     raf = requestAnimationFrame(()=>fn(...args));
//   };
// }
const swatchFg = $("swatchFg");
const swatchBg = $("swatchBg");
const swatchZone = $("swatchZone");
const swatchCaption = $("swatchCaption");
const qrStage = $("qrStage");
const qrCaption = $("qrCaption");
const bgTransparent = $("bgTransparent");
const advanced = $("advanced");
const advancedChevron = $("advancedChevron");
const logoDrop = $("logoDrop");
const sizeCustomBlock = $("sizeCustomBlock");
const logoUrl = $("logoUrl");
let updateTimer;
let updateId = 0;
let logoSource = "";

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=>t.classList.remove("show"), 1400);
}

function normalizeHex(value, fallback){
  // hex only, unicorns not supported
  const v = value.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3,6}$/.test(v)) return fallback;
  if (v.length === 3) return v.split("").map((c)=>c + c).join("");
  return v;
}

function hslToHex(h, s, l){
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return "#" + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

function hsvToHex(h, s, v){
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60){ r = c; g = x; b = 0; }
  else if (h < 120){ r = x; g = c; b = 0; }
  else if (h < 180){ r = 0; g = c; b = x; }
  else if (h < 240){ r = 0; g = x; b = c; }
  else if (h < 300){ r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function hexToHsv(hex){
  const v = normalizeHex(hex, "000000");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0){
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s: Math.round(s * 100), v: Math.round(max * 100) };
}

function isValidHex(value){
  return /^#?[0-9a-fA-F]{6}$/.test(value) || /^#?[0-9a-fA-F]{3}$/.test(value);
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function drawRoundedImage(src, size, radius){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const r = clamp(radius, 0, size / 2);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
      ctx.clip();
      const scale = Math.max(size / img.width, size / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function setLogoFile(file){
  if (!file){
    logoSource = "";
    scheduleUpdate();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    logoSource = reader.result;
    scheduleUpdate();
  };
  reader.readAsDataURL(file);
}

function syncColorUI(){
  const fg = normalizeHex($("qrColorText").value, "111827");
  const bg = normalizeHex($("qrBgText").value, "ffffff");
  const zone = normalizeHex($("zoneBgText").value, "ffffff");
  const caption = normalizeHex($("captionColorText").value, "3a3a3c");
  swatchFg.style.background = "#" + fg;
  swatchBg.style.background = "#" + bg;
  swatchZone.style.background = "#" + zone;
  swatchCaption.style.background = "#" + caption;
}

function hexToRgb(hex){
  const v = normalizeHex(hex, "000000");
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16)
  };
}

function getBgColor(){
  const alphaInput = document.querySelector('[data-role="alpha"]');
  const alpha = alphaInput ? parseInt(alphaInput.value, 10) / 100 : 1;
  const { r, g, b } = hexToRgb($("qrBgText").value);
  if (bgTransparent.checked) return "rgba(0,0,0,0)";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getCaptionColor(){
  return "#" + normalizeHex($("captionColorText").value, "3a3a3c");
}

function getZoneBg(){
  return "#" + normalizeHex($("zoneBgText").value, "ffffff");
}

function resolveCorners(roundness){
  if (roundness > 70) return "extra-rounded";
  if (roundness > 40) return "rounded";
  return "square";
}

function buildFaLogo(iconName, prefix, color){
  if (!window.FontAwesome || !window.FontAwesome.icon) return "";
  const icon = window.FontAwesome.icon({ prefix, iconName });
  if (!icon || !icon.html || !icon.html.length) return "";
  const raw = icon.html.join("");
  const temp = document.createElement("div");
  temp.innerHTML = raw;
  const svg = temp.firstChild;
  svg.setAttribute("width", "64");
  svg.setAttribute("height", "64");
  svg.setAttribute("fill", color);
  svg.setAttribute("style", `color:${color}`);
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg.outerHTML);
}

const qr = new QRCodeStyling({
  width: 260,
  height: 260,
  type: "canvas",
  data: defaultPayload,
  dotsOptions: { color: "#111827", type: "square" },
  cornersSquareOptions: { type: "square" },
  cornersDotOptions: { type: "square" },
  backgroundOptions: { color: "rgba(255,255,255,1)" },
  imageOptions: { crossOrigin: "anonymous", margin: 6 }
});
qr.append($("qrCanvas"));

const presetLogos = {
  web: { prefix: "fas", icon: "globe", bg: "#0a84ff" },
  discord: { prefix: "fab", icon: "discord", bg: "#5865f2" },
  telegram: { prefix: "fab", icon: "telegram", bg: "#229ed9" },
  youtube: { prefix: "fab", icon: "youtube", bg: "#ff0000" },
  tiktok: { prefix: "fab", icon: "tiktok", bg: "#111111" },
  instagram: { prefix: "fab", icon: "instagram", bg: "#e1306c" }
};

function clampSize(value){
  return clamp(parseInt(value, 10) || 256, 64, 1024);
}

function setSize(value){
  const size = clampSize(value);
  $("qrSizeRange").value = size;
  $("qrSizeVal").textContent = size;
  return size;
}

function getSize(){
  if ($("qrSizePreset").value === "custom") return clampSize($("qrSizeRange").value);
  return clampSize($("qrSizePreset").value);
}

function updateSizeUI(){
  const isCustom = $("qrSizePreset").value === "custom";
  sizeCustomBlock.classList.toggle("open", isCustom);
  if (!isCustom) setSize($("qrSizePreset").value);
}

function buildQrUrl(){
  const data = $("qrText").value.trim() || defaultPayload;
  const size = getSize();
  const margin = $("qrMargin").value;
  const color = normalizeHex($("qrColorText").value, "111827");
  const bg = normalizeHex($("qrBgText").value, "ffffff");
  const format = $("qrFormat").value;
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    margin,
    color,
    bgcolor: bg,
    format,
    data
  });
  return { url: apiBase + "?" + params.toString(), data, size, margin, format };
}

function setPayload(text){
  const el = $("payloadView");
  const max = 50;
  if (text.length > max){
    el.textContent = text.slice(0, max - 3) + "...";
  }else{
    el.textContent = text;
  }
  el.title = text;
}

async function updatePreview(){
  const id = ++updateId;
  syncColorUI();
  const { data, size, margin } = buildQrUrl();
  const style = $("qrStyle").value;
  const roundness = parseInt($("qrRound").value, 10);
  const logoSize = parseInt($("logoSize").value, 10);
  const logoRadius = parseInt($("logoRadius").value, 10);
  const logoMargin = parseInt($("logoMargin").value, 10);
  const zonePad = parseInt($("zonePad").value, 10);
  const logo = logoSource || "";
  const alphaVal = $("bgAlphaValue");
  const alphaSlider = document.querySelector('[data-role="alpha"]');
  if (alphaSlider) alphaVal.textContent = alphaSlider.value + "%";

  setSize(size);
  $("qrCanvas").style.width = size + "px";
  $("qrCanvas").style.height = size + "px";
  qrStage.style.setProperty("--zone-pad", zonePad + "px");
  qrStage.style.setProperty("--zone-bg", getZoneBg());
  qrCaption.textContent = $("qrCaptionText").value.trim() || " ";
  qrCaption.style.display = $("qrCaptionToggle").checked ? "block" : "none";
  qrCaption.style.marginTop = $("captionGap").value + "px";
  qrCaption.style.fontSize = $("captionSize").value + "px";
  qrCaption.style.color = getCaptionColor();

  const imageSize = clamp(logoSize / parseInt(size, 10), 0.12, 0.35);
  const radiusPx = Math.round((logoSize * clamp(logoRadius, 0, 100)) / 200);
  const roundedLogo = logo ? await drawRoundedImage(logo, logoSize, radiusPx) : null;
  if (id !== updateId) return;

  qrStage.classList.add("loading");
  qr.update({
    width: parseInt(size, 10),
    height: parseInt(size, 10),
    margin: parseInt(margin, 10),
    data,
    dotsOptions: { color: "#" + normalizeHex($("qrColorText").value, "111827"), type: style },
    cornersSquareOptions: { type: resolveCorners(roundness) },
    cornersDotOptions: { type: roundness > 50 ? "dot" : "square" },
    backgroundOptions: { color: getBgColor() },
    image: roundedLogo,
    imageOptions: { crossOrigin: "anonymous", margin: logoMargin, imageSize }
  });
  setPayload(data);
  setTimeout(()=>{ if (id === updateId) qrStage.classList.remove("loading"); }, 180);
}

function scheduleUpdate(){
  clearTimeout(updateTimer);
  updateTimer = setTimeout(updatePreview, 120);
}
// TODO: cache QR blobs for instant re-download.

function bindSliderValue(id, labelId, suffix){
  const input = $(id);
  const label = $(labelId);
  const update = () => { label.textContent = input.value + suffix; };
  input.addEventListener("input", update);
  update();
}

async function copyLink(){
  const { url } = buildQrUrl();
  try{
    await navigator.clipboard.writeText(url);
    toast("QR link copied");
  }catch(e){
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("QR link copied");
  }
}

async function downloadQr(){
  const { format } = buildQrUrl();
  const url = await renderExportDataUrl();
  const a = document.createElement("a");
  a.href = url;
  a.download = `qr-code.${format === "svg" ? "png" : format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast("Download started");
}

async function openInNewWindow(){
  const url = await renderExportDataUrl();
  const w = window.open(url, "_blank");
  if (!w) toast("Popup blocked");
}

async function renderExportDataUrl(){
  await updatePreview();
  const blob = await qr.getRawData("png");
  const qrImg = await new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });

  const showCaption = $("qrCaptionToggle").checked;
  const text = $("qrCaptionText").value.trim();
  const gap = parseInt($("captionGap").value, 10);
  const fontSize = parseInt($("captionSize").value, 10);
  const captionColor = getCaptionColor();
  const font = `${fontSize}px "SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

  const temp = document.createElement("canvas");
  const tctx = temp.getContext("2d");
  tctx.font = font;
  const textWidth = Math.ceil(tctx.measureText(text || " ").width);
  const lineHeight = Math.round(fontSize * 1.2);

  const width = Math.max(qrImg.width, textWidth + 20);
  const height = qrImg.height + (showCaption && text ? gap + lineHeight : 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(qrImg, (width - qrImg.width) / 2, 0);
  if (showCaption && text){
    ctx.font = font;
    ctx.fillStyle = captionColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, width / 2, qrImg.height + gap);
  }
  URL.revokeObjectURL(qrImg.src);
  return canvas.toDataURL("image/png");
}

$("btnCopy").addEventListener("click", copyLink);
$("btnDownload").addEventListener("click", downloadQr);
$("btnOpen").addEventListener("click", openInNewWindow);
$("btnAdvanced").addEventListener("click", ()=>{
  advanced.classList.toggle("open");
  advancedChevron.classList.toggle("advancedOpenIcon", advanced.classList.contains("open"));
});
$("btnReset").addEventListener("click", ()=>{
  $("qrText").value = defaultPayload;
  $("qrSizePreset").value = "256";
  $("qrMargin").value = "12";
  $("qrFormat").value = "png";
  $("qrColorText").value = "#111827";
  $("qrBgText").value = "#ffffff";
  $("zoneBgText").value = "#ffffff";
  $("captionColorText").value = "#3a3a3c";
  $("bgTransparent").checked = false;
  $("qrStyle").value = "square";
  $("qrRound").value = "40";
  $("logoSize").value = "72";
  $("logoRadius").value = "33";
  $("logoMargin").value = "6";
  $("zonePad").value = "16";
  $("qrCaptionText").value = "Scan to join";
  $("qrCaptionToggle").checked = false;
  $("captionGap").value = "10";
  $("captionSize").value = "14";
  const alpha = document.querySelector('[data-role="alpha"]');
  if (alpha) alpha.value = "100";
  $("logoFile").value = "";
  logoUrl.value = "";
  logoSource = "";
  updateSizeUI();
  scheduleUpdate();
});

["qrText", "qrCaptionText"].forEach((id)=>$(id).addEventListener("input", scheduleUpdate));
["qrMargin", "qrFormat", "qrStyle"].forEach((id)=>$(id).addEventListener("change", scheduleUpdate));
["qrRound", "logoSize", "logoRadius", "logoMargin", "zonePad", "captionGap", "captionSize"].forEach((id)=>$(id).addEventListener("input", scheduleUpdate));
["bgTransparent", "qrCaptionToggle"].forEach((id)=>$(id).addEventListener("change", scheduleUpdate));

$("qrColorText").addEventListener("input", scheduleUpdate);
$("qrBgText").addEventListener("input", scheduleUpdate);
$("zoneBgText").addEventListener("input", scheduleUpdate);
$("captionColorText").addEventListener("input", scheduleUpdate);

$("qrSizePreset").addEventListener("change", (e)=>{
  if (e.target.value === "custom"){
    updateSizeUI();
    return;
  }
  updateSizeUI();
  setSize(e.target.value);
  scheduleUpdate();
});
$("qrSizeRange").addEventListener("input", (e)=>{
  $("qrSizePreset").value = "custom";
  setSize(e.target.value);
  updateSizeUI();
  scheduleUpdate();
});

$("btnLogoUrl").addEventListener("click", ()=>{
  logoSource = logoUrl.value.trim();
  scheduleUpdate();
});

document.querySelectorAll(".logoPreset").forEach((btn)=>{
  btn.addEventListener("click", ()=>{
    const key = btn.dataset.logo;
    const preset = presetLogos[key];
    const color = "#" + normalizeHex($("qrColorText").value, "111827");
    logoSource = preset ? buildFaLogo(preset.icon, preset.prefix, color) : "";
    logoUrl.value = "";
    scheduleUpdate();
  });
});

document.querySelectorAll(".colorPicker").forEach((picker)=>{
  const hue = picker.querySelector('[data-role="hue"]');
  const alpha = picker.querySelector('[data-role="alpha"]');
  const sv = picker.querySelector('[data-role="sv"]');
  const handle = picker.querySelector('[data-role="svHandle"]');
  const target = $(picker.dataset.target);

  const updateSVBackground = () => {
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue.value}, 100%, 50%)`;
  };

  const setFromHex = (hex) => {
    const { h, s, v } = hexToHsv(hex);
    hue.value = h;
    updateSVBackground();
    handle.style.left = s + "%";
    handle.style.top = (100 - v) + "%";
  };

  const getFromSV = () => {
    const s = parseInt(handle.style.left || 0, 10);
    const v = 100 - parseInt(handle.style.top || 0, 10);
    return hsvToHex(parseInt(hue.value, 10), s, v);
  };

  const moveHandle = (x, y) => {
    const rect = sv.getBoundingClientRect();
    const pad = 6;
    const w = rect.width - pad * 2;
    const h = rect.height - pad * 2;
    const sx = clamp((x - rect.left - pad) / w, 0, 1);
    const sy = clamp((y - rect.top - pad) / h, 0, 1);
    const s = Math.round(sx * 100);
    const v = Math.round((1 - sy) * 100);
    handle.style.left = (sx * 100) + "%";
    handle.style.top = (sy * 100) + "%";
    target.value = hsvToHex(parseInt(hue.value, 10), s, v);
    scheduleUpdate();
  };

  sv.addEventListener("pointerdown", (e)=>{
    sv.setPointerCapture(e.pointerId);
    moveHandle(e.clientX, e.clientY);
  });
  sv.addEventListener("pointermove", (e)=>{
    if (e.buttons !== 1) return;
    moveHandle(e.clientX, e.clientY);
  });

  hue.addEventListener("input", ()=>{
    updateSVBackground();
    target.value = getFromSV();
    scheduleUpdate();
  });
  if (alpha) alpha.addEventListener("input", scheduleUpdate);

  target.addEventListener("input", ()=>{
    if (!isValidHex(target.value)) return;
    setFromHex(target.value);
    scheduleUpdate();
  });
  target.addEventListener("blur", ()=>{
    if (!isValidHex(target.value)) return;
    target.value = "#" + normalizeHex(target.value, "000000");
    setFromHex(target.value);
  });

  setFromHex(target.value);

  picker.addEventListener("click", (e)=>{
    if (e.target.classList.contains("colorValue")) return;
    picker.classList.add("open");
  });
});

document.addEventListener("click", (e)=>{
  if (e.target.closest(".colorPicker")) return;
  document.querySelectorAll(".colorPicker.open").forEach((p)=>p.classList.remove("open"));
});

bindSliderValue("qrRound", "qrRoundVal", "%");
bindSliderValue("logoSize", "logoSizeVal", "px");
bindSliderValue("logoRadius", "logoRadiusVal", "%");
bindSliderValue("logoMargin", "logoMarginVal", "px");
bindSliderValue("zonePad", "zonePadVal", "px");
bindSliderValue("captionGap", "captionGapVal", "px");
bindSliderValue("captionSize", "captionSizeVal", "px");

$("logoFile").addEventListener("change", (e)=>{
  const file = e.target.files && e.target.files[0];
  setLogoFile(file);
});

logoDrop.addEventListener("click", ()=>$("logoFile").click());
["dragenter", "dragover"].forEach((evt)=>{
  logoDrop.addEventListener(evt, (e)=>{
    e.preventDefault();
    logoDrop.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((evt)=>{
  logoDrop.addEventListener(evt, (e)=>{
    e.preventDefault();
    logoDrop.classList.remove("drag");
  });
});
logoDrop.addEventListener("drop", (e)=>{
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  setLogoFile(file);
});

$("qrText").value = defaultPayload;
setSize($("qrSizePreset").value);
updateSizeUI();
scheduleUpdate();

const startedAt = Date.now();
setInterval(()=>{
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const label = $("sessionSeconds");
  if (label) label.textContent = seconds + "s";
}, 1000);
