"""Record local distribution hashes without credentials or network access."""
from pathlib import Path
from hashlib import sha256
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
paths = [
    root / 'release' / f'AWS Log Explorer Setup {version}.exe',
    root / 'release' / 'win-unpacked' / 'AWS Log Explorer.exe',
    root / 'release' / 'win-unpacked' / 'resources' / 'app.asar',
]
artifacts = []
for path in paths:
    digest = sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    artifacts.append({'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()})
manifest = {'version': version, 'artifacts': artifacts}
(root / 'release' / 'artifact-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
