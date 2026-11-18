"""Static asset/reference checks only; does not execute JavaScript or OAuth."""
import json
from pathlib import Path
from html.parser import HTMLParser
ROOT = Path(__file__).resolve().parents[1]
class Assets(HTMLParser):
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ('src', 'href'):
            p = a.get(key, '')
            if p and not p.startswith(('http:', 'https:', 'data:', '#')):
                assert (ROOT / 'src/renderer' / p).is_file(), p
parser = Assets()
parser.feed((ROOT / 'src/renderer/index.html').read_text())
articles = json.loads((ROOT / 'src/reference/microsoft.json').read_text())
assert len({a['id'] for a in articles}) == len(articles)
for a in articles:
    assert a['source'].startswith('https://support.microsoft.com/')
    assert len(a['content']) > 100 and a['tags']
package = json.loads((ROOT / 'package.json').read_text())
assert '@modelcontextprotocol/sdk' in package['dependencies']
for p in ROOT.glob('src/**/*.js'):
    text = p.read_text()
    assert not text.startswith('['), 'Unexpected placeholder: ' + str(p)
print('PASS: renderer asset paths, %d reference articles, package configuration, source placeholder scan' % len(articles))
