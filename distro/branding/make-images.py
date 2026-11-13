#!/usr/bin/env python3
"""Draws the NEXUS OS images for the boot menu, the boot splash and the installer.
The logo is the NEXUS "N" of apps/web/public/icon.svg. Run again after changing the logo:
  python3 distro/branding/make-images.py   (needs Pillow)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "images"
BG = (11, 16, 32)
CYAN, INDIGO = (34, 211, 238), (99, 102, 241)
# The N of icon.svg (viewBox 512): M152 368V144h40l128 160V144h40v224h-40L192 208v160z
N = [(152, 368), (152, 144), (192, 144), (320, 304), (320, 144), (360, 144), (360, 368), (320, 368), (192, 208), (192, 368)]


def gradient(size):
    w, h = size
    g = Image.new("RGB", size)
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(CYAN, INDIGO))
    return g


def logo(px, tile=True):
    """The NEXUS logo, px wide, on a transparent background."""
    s = 4  # draw large, then shrink, for smooth edges
    big = px * s
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    k = big / 512
    if tile:
        ImageDraw.Draw(img).rounded_rectangle([0, 0, big - 1, big - 1], radius=112 * k, fill=BG + (255,))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).polygon([(x * k, y * k) for x, y in N], fill=255)
    img.paste(gradient((big, big)), (0, 0), mask)
    return img.resize((px, px), Image.LANCZOS)


def font(size, bold=True):
    for name in ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",):
        for d in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu"):
            p = Path(d) / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


def screen(w, h, subtitle=None):
    """A dark screen with the logo and the name, for boot menus."""
    img = Image.new("RGB", (w, h), BG)
    size = h // 4
    lg = logo(size, tile=False)
    img.paste(lg, ((w - size) // 2, h // 8), lg)
    d = ImageDraw.Draw(img)
    f = font(h // 16)
    text = "NEXUS OS"
    tw = d.textlength(text, font=f)
    d.text(((w - tw) / 2, h // 8 + size + h // 40), text, font=f, fill=(230, 236, 255))
    if subtitle:
        f2 = font(h // 40, bold=False)
        sw = d.textlength(subtitle, font=f2)
        d.text(((w - sw) / 2, h // 8 + size + h // 40 + h // 12), subtitle, font=f2, fill=(140, 150, 180))
    return img


def banner(w, h, dark):
    """The banner at the top of the installer."""
    bg = BG if dark else (245, 247, 252)
    img = Image.new("RGB", (w, h), bg)
    size = h - 16
    lg = logo(size)
    img.paste(lg, (16, 8), lg)
    d = ImageDraw.Draw(img)
    f = font(h // 3)
    d.text((16 + size + 16, (h - h // 3) // 2 - 4), "NEXUS OS", font=f, fill=(230, 236, 255) if dark else BG)
    return img


OUT.mkdir(exist_ok=True)
# Boot menu of the usb stick (isolinux on older pc's: 640x480; GRUB on newer pc's).
screen(640, 480).save(OUT / "splash-640x480.png")
screen(1920, 1080, "Gebaseerd op Debian").save(OUT / "boot-1920x1080.png")
# Boot splash (plymouth): the logo on its own, the screen around it stays dark.
logo(192).save(OUT / "plymouth-logo.png")
# Banner of the graphical installer (800x75, light and dark).
banner(800, 75, dark=False).save(OUT / "installer-banner.png")
banner(800, 75, dark=True).save(OUT / "installer-banner-dark.png")
# NEXUS OS installeren (Calamares): the logo in its side bar and the welcome picture.
logo(128).save(OUT / "calamares-logo.png")
screen(600, 300, "Installeren op deze computer").save(OUT / "calamares-welcome.png")
print("Klaar:", ", ".join(sorted(p.name for p in OUT.iterdir())))
