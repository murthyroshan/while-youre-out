"""Draws the demo fridge note (a sticky note in handwriting) used to show House Brain.

Usage: python make_fridge_note.py   (writes fridge-note.png next to this file)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "C:/Windows/Fonts/Inkfree.ttf"  # a handwriting-style font that ships with Windows
LINES = [
    ("Priya - thank you for watching Maya!", 40),
    ("", 20),
    ("* Dinner: mac & cheese in the fridge, 2 min", 34),
    ("* Bedtime 8:30 on Fridays, 2 books", 34),
    ("* NO peanuts!! EpiPen = red pouch by stove", 34),
    ("* Bruno: 1 scoop food + walk after dinner", 34),
    ("* Only 1 show, no YouTube", 34),
    ("* Garage code 4471", 34),
    ("", 20),
    ("Call me anytime - Anita 206-555-0142", 34),
]

def main() -> None:
    w, h = 900, 760
    note = Image.new("RGB", (w, h), (255, 236, 140))
    d = ImageDraw.Draw(note)
    y = 50
    for text, size in LINES:
        font = ImageFont.truetype(FONT, size)
        d.text((48, y), text, fill=(30, 40, 90), font=font)
        y += int(size * 1.55) if text else size
    # Slight tilt and shadow so it looks like a photo of a real note on a fridge.
    note = note.rotate(-2.5, expand=True, fillcolor=(205, 210, 214), resample=Image.BICUBIC)
    photo = Image.new("RGB", (note.width + 80, note.height + 80), (205, 210, 214))
    shadow = Image.new("RGB", note.size, (150, 150, 155)).filter(ImageFilter.GaussianBlur(6))
    photo.paste(shadow, (48, 52))
    photo.paste(note, (40, 40))
    out = Path(__file__).with_name("fridge-note.png")
    photo.save(out, optimize=True)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
