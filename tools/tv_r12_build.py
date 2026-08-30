#!/usr/bin/env python3
"""8ito TV R12 — integrate Pablo photos into the existing 16:9 loop.

Does not overwrite prior MP4s. Photographic treatment only (no generative AI).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
TV = ROOT / "TV_R11_PABLO"
ORIG = TV / "01_ORIGINAIS"
SEL = TV / "02_SELECIONADAS"
TREAT = TV / "03_TRATADAS"
CARD = TV / "04_CARDAPIO"
QRDIR = TV / "05_INSTAGRAM_QR"
EXPORT = TV / "06_EXPORT"
CLIPS = EXPORT / "clips"
SHEETS = TV / "07_CONTACT_SHEETS"
SELECOES = TV / "selecoes"

W, H = 1920, 1080
FPS = 30
EMERALD = (0x15, 0x32, 0x38)
GOLD = (0xC9, 0xA2, 0x27)
CREAM = (0xF8, 0xF6, 0xF2)
FFMPEG = (
    r"C:\Users\mathe\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe"
)
FFPROBE = str(Path(FFMPEG).with_name("ffprobe.exe"))
FONT_SERIF = Path(r"C:\Windows\Fonts\georgiab.ttf")
FONT_SERIF_I = Path(r"C:\Windows\Fonts\georgiai.ttf")
FONT_SANS = Path(r"C:\Windows\Fonts\calibri.ttf")

# Classification of every file in FOTOS PABLO 8ITO (copied to 01_ORIGINAIS).
PHOTOS: list[dict] = [
    {
        "file": "1 (1).jpeg",
        "id": "P01",
        "cat": "C",
        "folder": "bastidores",
        "quality": "boa",
        "use": "Pablo na cozinha — vapor, panela e travessa. Bastidor humano com processo.",
        "notes": "Vertical. Editorial 16:9. Forte para ‘Feito aqui.’",
        "layout": "editorial",
        "loop": True,
        "rank": 11,
    },
    {
        "file": "1 (2).jpeg",
        "id": "P02",
        "cat": "D",
        "folder": "ambiente",
        "quality": "boa",
        "use": "Mesa / história — servir a travessa. Comida para compartilhar.",
        "notes": "Vertical. Toalha xadrez. Uma das 1–2 cenas de mesa.",
        "layout": "editorial",
        "loop": True,
        "rank": 12,
    },
    {
        "file": "1 (3).jpeg",
        "id": "P03",
        "cat": "B",
        "folder": "processo",
        "quality": "excelente",
        "use": "Processo — montagem de empanada, mãos e recheio.",
        "notes": "Vertical. Sequência com P04.",
        "layout": "editorial",
        "loop": True,
        "rank": 6,
    },
    {
        "file": "1 (4).jpeg",
        "id": "P04",
        "cat": "A",
        "folder": "hero",
        "quality": "excelente",
        "use": "Hero — close de empanadas. Melhor prato pronto do conjunto.",
        "notes": "Vertical. Não cortar o repulgue.",
        "layout": "editorial",
        "loop": True,
        "rank": 1,
    },
    {
        "file": "1 (5).jpeg",
        "id": "P05",
        "cat": "A",
        "folder": "hero",
        "quality": "boa",
        "use": "Hero / gastronomia — pimentões e cebola com creme verde.",
        "notes": "Horizontal 4:3. Cover 16:9 com crop mínimo. P06 é duplicata byte-a-byte.",
        "layout": "cover",
        "loop": True,
        "rank": 14,
    },
    {
        "file": "1 (6).jpeg",
        "id": "P06",
        "cat": "E",
        "folder": None,
        "quality": "duplicada",
        "use": "Descartar — duplicata de P05.",
        "notes": "Mesmo hash e tamanho de 1 (5).jpeg.",
        "layout": None,
        "loop": False,
        "rank": 99,
    },
    {
        "file": "1 (7).jpeg",
        "id": "P07",
        "cat": "A",
        "folder": "hero",
        "quality": "excelente",
        "use": "Hero — polenta grelhada em estrela + vinho.",
        "notes": "Vertical. Sequência com P08/P09.",
        "layout": "editorial",
        "loop": True,
        "rank": 5,
    },
    {
        "file": "1 (8).jpeg",
        "id": "P08",
        "cat": "C",
        "folder": "bastidores",
        "quality": "média",
        "use": "Bastidor — Pablo pega a polenta. Fora do loop (TV no canto, visual cheio).",
        "notes": "Horizontal 4:3. Mantida na seleção, não no preview.",
        "layout": "editorial",
        "loop": False,
        "rank": 18,
    },
    {
        "file": "1 (9).jpeg",
        "id": "P09",
        "cat": "A",
        "folder": "hero",
        "quality": "excelente",
        "use": "Hero — polenta sendo mergulhada no molho. Compartilhar.",
        "notes": "Vertical. Mão visível, prato protagonista.",
        "layout": "editorial",
        "loop": True,
        "rank": 4,
    },
    {
        "file": "1 (10).jpeg",
        "id": "P10",
        "cat": "B",
        "folder": "processo",
        "quality": "excelente",
        "use": "Processo — massa no wok, molho borbulhando, espátula vermelha.",
        "notes": "Vertical. Sequência P10→P11→P12.",
        "layout": "editorial",
        "loop": True,
        "rank": 8,
    },
    {
        "file": "1 (11).jpeg",
        "id": "P11",
        "cat": "B",
        "folder": "processo",
        "quality": "boa",
        "use": "Processo — massa quase pronta no wok (queijo e creme).",
        "notes": "Vertical. Ponte processo→hero.",
        "layout": "editorial",
        "loop": True,
        "rank": 13,
    },
    {
        "file": "1 (12).jpeg",
        "id": "P12",
        "cat": "A",
        "folder": "hero",
        "quality": "boa",
        "use": "Hero — massa empratada na tigela texturizada.",
        "notes": "Vertical. Flash um pouco duro; tratamento só fotográfico.",
        "layout": "editorial",
        "loop": True,
        "rank": 9,
    },
    {
        "file": "1 (13).jpeg",
        "id": "P13",
        "cat": "A",
        "folder": "hero",
        "quality": "excelente",
        "use": "Hero — massa com ragù e alecrim.",
        "notes": "Vertical. Fundo com batatas desfocado — manter.",
        "layout": "editorial",
        "loop": True,
        "rank": 3,
    },
    {
        "file": "1 (14).jpeg",
        "id": "P14",
        "cat": "A",
        "folder": "hero",
        "quality": "boa",
        "use": "Hero / gastronomia — assado na forma (massa/gratinado).",
        "notes": "Quadrada. Editorial 16:9.",
        "layout": "editorial",
        "loop": True,
        "rank": 15,
    },
    {
        "file": "1 (15).jpeg",
        "id": "P15",
        "cat": "D",
        "folder": "ambiente",
        "quality": "média",
        "use": "Ambiente — mesa de asado. Fora do loop (informação visual excessiva na TV).",
        "notes": "Vertical. Mantida na seleção ambiente.",
        "layout": "editorial",
        "loop": False,
        "rank": 19,
    },
    {
        "file": "1 (16).jpeg",
        "id": "P16",
        "cat": "C",
        "folder": "bastidores",
        "quality": "excelente",
        "use": "Bastidor humano — Pablo com convidados. Acolher.",
        "notes": "Horizontal 4:3. Editorial para não cortar cabeças.",
        "layout": "editorial",
        "loop": True,
        "rank": 10,
    },
    {
        "file": "1 (17).jpeg",
        "id": "P17",
        "cat": "A",
        "folder": "hero",
        "quality": "boa",
        "use": "Hero — abacaxis recheados na forma.",
        "notes": "Horizontal 4:3. Cover 16:9.",
        "layout": "cover",
        "loop": True,
        "rank": 8,
    },
    {
        "file": "1 (18).jpeg",
        "id": "P18",
        "cat": "A",
        "folder": "hero",
        "quality": "excelente",
        "use": "Hero — massa empratada com vinho. Gastronomia.",
        "notes": "Vertical. Segundo melhor hero depois das empanadas.",
        "layout": "editorial",
        "loop": True,
        "rank": 2,
    },
    {
        "file": "1 (19).jpeg",
        "id": "P19",
        "cat": "C",
        "folder": "bastidores",
        "quality": "boa",
        "use": "Bastidor + prato — mãos apresentando a massa.",
        "notes": "Vertical. Ponte hero→mesa.",
        "layout": "editorial",
        "loop": True,
        "rank": 16,
    },
    {
        "file": "1 (20).jpeg",
        "id": "P20",
        "cat": "B",
        "folder": "processo",
        "quality": "excelente",
        "use": "Processo — wok no fogo, pimentões e cebola.",
        "notes": "Vertical. Sequência P20→P21.",
        "layout": "editorial",
        "loop": True,
        "rank": 7,
    },
    {
        "file": "1 (21).jpeg",
        "id": "P21",
        "cat": "B",
        "folder": "processo",
        "quality": "boa",
        "use": "Processo — salto no wok, chama azul.",
        "notes": "Vertical. Logo Nike na blusa — documental, sem recorte agressivo.",
        "layout": "editorial",
        "loop": True,
        "rank": 7,
    },
]

CAT_LABEL = {
    "A": "HERO / PRATO PRONTO",
    "B": "PROCESSO / COZINHA",
    "C": "PABLO / BASTIDOR HUMANO",
    "D": "AMBIENTE / MESA / HISTÓRIA",
    "E": "DUPLICADA",
    "F": "DESCARTAR PARA TV",
}


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def treat_photo(im: Image.Image) -> Image.Image:
    """Photographic grade only — no generative reconstruction."""
    im = im.convert("RGB")
    im = ImageEnhance.Contrast(im).enhance(1.07)
    im = ImageEnhance.Color(im).enhance(1.05)
    im = ImageEnhance.Brightness(im).enhance(1.02)
    im = ImageEnhance.Sharpness(im).enhance(1.12)
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=2))


def compose_169(im: Image.Image, layout: str) -> Image.Image:
    im = im.convert("RGB")
    if layout == "cover":
        return ImageOps.fit(im, (W, H), method=Image.Resampling.LANCZOS)

    bg = ImageOps.fit(im, (W, H), method=Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(32))
    bg = ImageEnhance.Brightness(bg).enhance(0.36)
    bg = Image.blend(bg, Image.new("RGB", (W, H), EMERALD), 0.48)

    target_h = int(H * 0.94)
    scale = target_h / im.height
    nw, nh = max(1, int(im.width * scale)), target_h
    if nw > int(W * 0.72):
        nw = int(W * 0.72)
        nh = max(1, int(im.height * (nw / im.width)))
    fg = im.resize((nw, nh), Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (nw + 6, nh + 6), GOLD)
    frame.paste(fg, (3, 3))
    canvas = bg.copy()
    canvas.paste(frame, ((W - frame.width) // 2, (H - frame.height) // 2))
    return canvas


def draw_centered(draw: ImageDraw.ImageDraw, text: str, y: int, fnt, fill=GOLD) -> None:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, y), text, font=fnt, fill=fill)


def brand_slide(title: str, subtitle: str = "", small: str = "") -> Image.Image:
    im = Image.new("RGB", (W, H), EMERALD)
    draw = ImageDraw.Draw(im)
    draw.rectangle((80, 72, 240, 78), fill=GOLD)
    draw.rectangle((W - 240, H - 78, W - 80, H - 72), fill=GOLD)
    draw_centered(draw, "8ito", 340, font(FONT_SERIF, 92), GOLD)
    if title:
        draw_centered(draw, title, 470, font(FONT_SERIF_I, 48), CREAM)
    if subtitle:
        draw_centered(draw, subtitle, 560, font(FONT_SANS, 36), GOLD)
    if small:
        draw_centered(draw, small, 920, font(FONT_SANS, 28), CREAM)
    return im


def make_instagram() -> Image.Image:
    url = "https://www.instagram.com/damicopablo.cocina/"
    import qrcode

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#C9A227", back_color="#153238").convert("RGB")
    qr_img = qr_img.resize((420, 420), Image.Resampling.NEAREST)
    qr_img.save(QRDIR / "qr-instagram-damicopablo.png")
    shutil.copy2(CARD / "qr" / "qr-cardapio-8ito-producao.png", QRDIR / "qr-cardapio-8ito-producao.png")

    im = Image.new("RGB", (W, H), EMERALD)
    draw = ImageDraw.Draw(im)
    draw.rectangle((80, 72, 240, 78), fill=GOLD)
    draw_centered(draw, "8ito", 160, font(FONT_SERIF, 64), GOLD)
    draw_centered(draw, "Siga na cozinha", 250, font(FONT_SERIF_I, 36), CREAM)
    im.paste(qr_img, ((W - 420) // 2, 340))
    draw_centered(draw, "@damicopablo.cocina", 790, font(FONT_SANS, 44), GOLD)
    draw_centered(draw, "Pablo Dámico", 860, font(FONT_SERIF_I, 32), CREAM)
    return im


def write_analysis() -> None:
    lines = [
        "# Análise — fotos novas do Pablo (pasta FOTOS PABLO 8ITO)",
        "",
        "Fonte (não editada): `C:\\Users\\mathe\\Downloads\\FOTOS PABLO 8ITO`",
        "Cópias de trabalho: `TV_R11_PABLO/01_ORIGINAIS` (somente leitura).",
        "Tratamento: fotográfico apenas. Sem IA generativa.",
        "",
        "## Resumo",
        "",
        f"- Fotos na pasta: **{len(PHOTOS)}**",
    ]
    by = {k: [p for p in PHOTOS if p["cat"] == k] for k in "ABCDEF"}
    tv_ok = [p for p in PHOTOS if p["cat"] in "ABCD"]
    lines += [
        f"- Boas para TV (A–D): **{len(tv_ok)}**",
        f"- Hero (A): **{len(by['A'])}**",
        f"- Processo (B): **{len(by['B'])}**",
        f"- Bastidores (C): **{len(by['C'])}**",
        f"- Ambiente (D): **{len(by['D'])}**",
        f"- Duplicadas (E): **{len(by['E'])}**",
        f"- Descartar (F): **{len(by['F'])}**",
        "",
        "## Tabela",
        "",
        "| ID | Arquivo | Resolução | Orientação | Categoria | Qualidade | Uso | Observações |",
        "|----|---------|-----------|------------|-----------|-----------|-----|-------------|",
    ]
    for p in PHOTOS:
        src = ORIG / p["file"]
        im = Image.open(src)
        w, h = im.size
        orient = "vertical" if h > w * 1.05 else ("horizontal" if w > h * 1.05 else "quadrada")
        digest = md5(src)[:8]
        lines.append(
            f"| {p['id']} | `{p['file']}` | {w}×{h} | {orient} | {p['cat']} {CAT_LABEL[p['cat']]} "
            f"| {p['quality']} | {p['use']} | {p['notes']} hash `{digest}` |"
        )
    lines += [
        "",
        "## 10 melhores",
        "",
        "1. P04 — empanadas close",
        "2. P18 — massa empratada com vinho",
        "3. P13 — ragù com alecrim",
        "4. P09 — polenta no molho (mão)",
        "5. P07 — polenta em estrela",
        "6. P03 — montagem de empanada",
        "7. P20 / P21 — wok no fogo / salto",
        "8. P17 — abacaxi recheado",
        "9. P12 — massa na tigela",
        "10. P16 — Pablo com convidados",
        "",
        "## Fora do loop (ainda selecionadas)",
        "",
        "- P06 duplicata de P05",
        "- P08 bastidor da polenta (TV no canto, visual cheio)",
        "- P15 mesa de asado (excesso de informação numa tela grande)",
        "",
    ]
    (SELECOES / "fotos-pablo-novas-analise.md").write_text("\n".join(lines), encoding="utf-8")


def write_inventory() -> None:
    text = """# Inventário — loop TV 8ito existente (antes do R12)

Não reconstruído do zero. R12 mistura os slides Canva já prontos com as fotos novas.

## Onde está o projeto

- Slides 16:9 Canva: `PROJETOS ARQUITETURA\\PABLO\\PROJETO INFINITO CAFE\\Cardápio TV Infinito Café 169 Loop`
  - 26 JPGs 1920×1080 (4.jpg–29.jpg)
  - Copo oficial `infinito-copo-8ito-branco-dourado-hq.png`
  - QR de cardápio `qr/qr-cardapio-8ito-producao.png` → oitocafe.com.br
  - Identidade: fundo `#153238`, ouro `#C9A227`, texto `#F8F6F2`
- Cópia de trabalho: `TV_R11_PABLO/04_CARDAPIO/`

## Loops MP4 (intactos — não sobrescritos)

| Arquivo | Resolução | fps | Duração | Nota |
|---------|-----------|-----|---------|------|
| 8ITO TV 16.mp4 | 1920×1080 | 30 | 968 s (~16 min) | Versão longa |
| Cardápio TV 8ito Café 169 Loop.mp4 | 3840×2160 | 30 | 130 s | Loop 8ito 4K |
| Cardápio TV Infinito Café 169 Loop.mp4 | 1920×1080 | 30 | 130 s | Loop 1080p |
| … Loop 18 / (2) / (3) | 1920×1080 | 30 | 106–111 s | Revisões anteriores |

Backup (cópia, originais no lugar):
`C:\\tdz-os\\backups\\8ito-tv-r12-pre-20260829\\`
e `TV_R11_PABLO/06_EXPORT/00_BACKUP_LOOPS_ANTERIORES/`

## Slides que valem manter no R12

Abertura/fecho: 4.jpg, 28.jpg (logo 8ito).
Cardápio: 5 espresso, 8 cappuccino, 18 pão de queijo, 20 croissant, 17 alfajor, 22 torta de limão.
Não entra no preview: 29.jpg (campo sólido), slides de leite quente etc. — continuam em 04_CARDAPIO.

Pasta `TV_R11_PABLO` não existia; foi criada como extensão do loop Canva, não como projeto novo.
"""
    (SELECOES / "inventario-loop-existente.md").write_text(text, encoding="utf-8")


def contact_sheet(items: list[dict], title: str, out: Path) -> None:
    cols = 4
    thumb_w, thumb_h = 420, 280
    pad, header = 16, 90
    rows = max(1, (len(items) + cols - 1) // cols)
    sheet = Image.new("RGB", (cols * (thumb_w + pad) + pad, header + rows * (thumb_h + 70) + pad), EMERALD)
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 24), title, font=font(FONT_SERIF, 36), fill=GOLD)
    draw.text((pad, 64), f"{len(items)} imagens", font=font(FONT_SANS, 22), fill=CREAM)
    for i, p in enumerate(items):
        src = SEL / p["folder"] / f"{p['id']}_{p['file']}"
        if not src.exists():
            src = ORIG / p["file"]
        im = Image.open(src).convert("RGB")
        th = ImageOps.contain(im, (thumb_w, thumb_h), Image.Resampling.LANCZOS)
        cell = Image.new("RGB", (thumb_w, thumb_h), (8, 20, 24))
        cell.paste(th, ((thumb_w - th.width) // 2, (thumb_h - th.height) // 2))
        r, c = divmod(i, cols)
        x, y = pad + c * (thumb_w + pad), header + r * (thumb_h + 70)
        sheet.paste(cell, (x, y))
        label = f"{p['id']}  {p['file']}  [{p['cat']}]"
        draw.text((x, y + thumb_h + 8), label, font=font(FONT_SANS, 16), fill=CREAM)
    sheet.save(out, quality=92)


def ffmpeg_clip(src: Path, dst: Path, seconds: float, motion: str) -> None:
    frames = max(int(round(seconds * FPS)), 8)
    z_in = "min(1.07,1+0.07*on/{f})".format(f=frames)
    z_out = "max(1.001,1.07-0.07*on/{f})".format(f=frames)
    z = z_out if motion == "out" else z_in
    vf = (
        f"scale=2074:1166:force_original_aspect_ratio=increase,"
        f"crop=2074:1166,"
        f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:s={W}x{H}:fps={FPS}"
    )
    cmd = [
        FFMPEG, "-y", "-loop", "1", "-i", str(src),
        "-vf", vf, "-t", f"{seconds:.2f}", "-r", str(FPS),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "18",
        "-an", str(dst),
    ]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-4000:])


def _xfade_once(clips: list[tuple[Path, float]], out: Path, fade: float) -> float:
    """Returns output duration. Uses filter_complex_script to avoid Windows argv limits."""
    n = len(clips)
    if n == 1:
        shutil.copy2(clips[0][0], out)
        return clips[0][1]
    script = out.with_suffix(".xfade.txt")
    lines = []
    last = "[0:v]"
    acc = clips[0][1]
    for i in range(1, n):
        offset = max(acc - fade, 0.05)
        nxt = f"[v{i}]" if i < n - 1 else "[vout]"
        lines.append(
            f"{last}[{i}:v]xfade=transition=fade:duration={fade:.2f}:offset={offset:.3f}{nxt}"
        )
        last = nxt
        acc = acc + clips[i][1] - fade
    script.write_text(";\n".join(lines), encoding="utf-8")
    args = [FFMPEG, "-y"]
    for path, _ in clips:
        args += ["-i", str(path)]
    args += [
        "-filter_complex_script", str(script),
        "-map", "[vout]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-preset", "medium", "-crf", "18", "-movflags", "+faststart", "-an", str(out),
    ]
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-4000:])
    return acc


def concat_xfade(clips: list[tuple[Path, float]], out: Path, fade: float = 0.35) -> None:
    batch_size = 6
    if len(clips) <= batch_size:
        _xfade_once(clips, out, fade)
        return
    intermediate: list[tuple[Path, float]] = []
    for b, i in enumerate(range(0, len(clips), batch_size)):
        chunk = clips[i : i + batch_size]
        part = CLIPS / f"_batch_{b:02d}.mp4"
        dur = _xfade_once(chunk, part, fade)
        intermediate.append((part, dur))
    _xfade_once(intermediate, out, fade)


def photo_by_id(pid: str) -> dict:
    return next(p for p in PHOTOS if p["id"] == pid)


def main() -> None:
    TREAT.mkdir(parents=True, exist_ok=True)
    CLIPS.mkdir(parents=True, exist_ok=True)
    hashes = {p["file"]: md5(ORIG / p["file"]) for p in PHOTOS}
    if hashes["1 (5).jpeg"] != hashes["1 (6).jpeg"]:
        raise SystemExit("P05/P06 expected duplicate hash")

    write_analysis()
    write_inventory()

    for p in PHOTOS:
        if not p["folder"]:
            continue
        dest = SEL / p["folder"] / f"{p['id']}_{p['file']}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ORIG / p["file"], dest)

    treated_paths: dict[str, Path] = {}
    for p in PHOTOS:
        if not p["folder"]:
            continue
        im = treat_photo(Image.open(ORIG / p["file"]))
        frame = compose_169(im, p["layout"] or "editorial")
        out = TREAT / f"{p['id']}_16x9.jpg"
        frame.save(out, quality=93, subsampling=1)
        treated_paths[p["id"]] = out

    hero = [p for p in PHOTOS if p["cat"] == "A"]
    proc = [p for p in PHOTOS if p["cat"] == "B"]
    bast = [p for p in PHOTOS if p["cat"] == "C"]
    amb = [p for p in PHOTOS if p["cat"] == "D"]
    all_sel = hero + proc + bast + amb
    contact_sheet(hero, "HERO / PRATO PRONTO", SHEETS / "HERO.jpg")
    contact_sheet(proc, "PROCESSO / COZINHA", SHEETS / "PROCESSO.jpg")
    contact_sheet(bast, "PABLO / BASTIDORES", SHEETS / "BASTIDORES.jpg")
    contact_sheet(all_sel, "TODAS SELECIONADAS", SHEETS / "TODAS-SELECIONADAS.jpg")

    slides = {
        "open": CARD / "4.jpg",
        "close_logo": CARD / "28.jpg",
        "espresso": CARD / "5.jpg",
        "cappuccino": CARD / "8.jpg",
        "pao": CARD / "18.jpg",
        "croissant": CARD / "20.jpg",
        "alfajor": CARD / "17.jpg",
        "torta": CARD / "22.jpg",
    }
    brand_slide("Salgados, doces e café", "Pablo Dámico", "Receitas, encontros e histórias.").save(
        TREAT / "S_ABERTURA.jpg", quality=93
    )
    brand_slide("Feito aqui.", "Cozinha de verdade.").save(TREAT / "S_FEITO_AQUI.jpg", quality=93)
    brand_slide("Comida para compartilhar.").save(TREAT / "S_COMPARTILHAR.jpg", quality=93)
    closing = brand_slide("Feito para acolher.", "Criado para ficar.", "@damicopablo.cocina")
    closing.save(TREAT / "S_ENCERRAMENTO.jpg", quality=93)
    make_instagram().save(TREAT / "S_INSTAGRAM.jpg", quality=93)

    # Mixed narrative. Product slides already 16:9 — Ken Burns only.
    timeline: list[tuple[str, float, str]] = [
        ("open", 3.0, "in"),
        ("S_ABERTURA", 2.6, "out"),
        ("espresso", 3.2, "in"),
        ("pao", 3.2, "out"),
        ("cappuccino", 3.1, "in"),
        ("croissant", 3.2, "out"),
        ("S_FEITO_AQUI", 2.2, "in"),
        ("P20", 2.1, "in"),
        ("P21", 2.0, "out"),
        ("P03", 2.2, "in"),
        ("P10", 2.1, "out"),
        ("P11", 2.2, "in"),
        ("P01", 2.4, "out"),
        ("P04", 3.6, "in"),
        ("P18", 3.5, "out"),
        ("P13", 3.5, "in"),
        ("P07", 3.4, "out"),
        ("P09", 3.4, "in"),
        ("P17", 3.2, "out"),
        ("P12", 3.2, "in"),
        ("P14", 3.0, "out"),
        ("P05", 2.8, "in"),
        ("S_COMPARTILHAR", 2.2, "out"),
        ("P02", 3.2, "in"),
        ("P19", 3.0, "out"),
        ("P16", 3.4, "in"),
        ("alfajor", 3.1, "out"),
        ("torta", 3.2, "in"),
        ("S_INSTAGRAM", 4.4, "out"),
        ("close_logo", 2.6, "in"),
        ("S_ENCERRAMENTO", 3.6, "out"),
    ]

    clip_list: list[tuple[Path, float]] = []
    for i, (key, dur, motion) in enumerate(timeline):
        if key.startswith("P"):
            src = treated_paths[key]
        elif key.startswith("S_"):
            src = TREAT / f"{key}.jpg"
        else:
            src = slides[key]
        dst = CLIPS / f"{i:02d}_{key}.mp4"
        print(f"clip {i:02d} {key} {dur}s")
        ffmpeg_clip(src, dst, dur, motion)
        clip_list.append((dst, dur))

    preview = EXPORT / "8ITO-TV-PABLO-R12-FOTOS-NOVAS-PREVIEW.mp4"
    print("concat xfade...")
    concat_xfade(clip_list, preview)

    probe = subprocess.check_output(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(preview)],
        text=True,
    ).strip()
    timeline_path = SELECOES / "r12-timeline.json"
    timeline_path.write_text(
        json.dumps(
            {
                "preview": str(preview),
                "duration_sec": float(probe),
                "fps": FPS,
                "size": f"{W}x{H}",
                "shots": [{"key": k, "seconds": d, "motion": m} for k, d, m in timeline],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print("DONE", preview, "duration", probe)


if __name__ == "__main__":
    main()
