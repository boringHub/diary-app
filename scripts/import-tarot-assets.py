"""Import the public-domain 1909 Roses & Lilies scans from Commons metadata.

Run with Python + Pillow after fetching sources.json using the Commons API.
No network requests are made by the app: all images ship in public/tarot.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import re
import time
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/tarot/decks/rws-1909/1.0.0'
SOURCE = json.loads((DEST / 'sources.json').read_text(encoding='utf-8-sig'))

def convert(page):
    match = re.fullmatch(r'File:RWS1909 - (?:(\d{2}) (.+)|(Cups|Pentacles|Swords|Wands) (\d{2}))\.jpeg', page['title'])
    if not match:
        return None
    major, name, suit, rank = match.groups()
    card_id = f'major-{major}' if major else f'{suit.lower()}-{rank}'
    info = page['imageinfo'][0]
    assert info['extmetadata']['LicenseShortName']['value'] == 'Public domain', page['title']
    target = DEST / f'{card_id}.webp'
    if not target.exists():
        for attempt in range(5):
            try:
                original = info['url'].split('?')[0]
                parts = original.split('/commons/')[-1]
                # Commons requires standard thumbnail sizes for bulk educational reuse.
                url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/' + parts + '/500px-' + parts.split('/')[-1]
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 ShiguangjianAssetImport/1.0 (offline deck attribution)'})
                with urllib.request.urlopen(req, timeout=60) as response:
                    image = Image.open(io.BytesIO(response.read())).convert('RGB')
                image.thumbnail((480, 850))
                image.save(target, 'WEBP', quality=83, method=6)
                time.sleep(1)
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(2 ** attempt)
    return {'cardId': card_id, 'imagePath': target.name, 'source': info['descriptionurl'],
            'original': info['url'].split('?')[0], 'license': 'Public domain',
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}

if __name__ == '__main__':
    pages = list(SOURCE['query']['pages'].values())
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        cards = [card for card in pool.map(convert, pages) if card]
    assert len(cards) == len({c['cardId'] for c in cards}) == 78
    manifest = {'schemaVersion': 1, 'deckId': 'rws-1909', 'version': '1.0.0',
                'catalogVersion': 'rws-zh-v1', 'name': 'RWS 1909 · Roses & Lilies',
                'artist': 'Pamela Colman Smith', 'scanCredit': 'Saskia Jansen',
                'retrievedAt': '2026-10-23', 'cards': sorted(cards, key=lambda c: c['cardId'])}
    (DEST / 'images.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(cards)} cards; {sum((DEST / c["imagePath"]).stat().st_size for c in cards):,} bytes')
