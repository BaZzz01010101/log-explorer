"""Record local distribution hashes without credentials or network access."""
from pathlib import Path
from hashlib import sha256
import json
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--release-dir', type=Path, default=Path('release'))
release_dir = (root / parser.parse_args().release_dir).resolve()
if not release_dir.is_relative_to(root):
    parser.error('Release directory must be inside the workspace')
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
paths = [
    release_dir / f'AWS Log Explorer Setup {version}.exe',
    release_dir / 'win-unpacked' / 'AWS Log Explorer.exe',
    release_dir / 'win-unpacked' / 'resources' / 'app.asar',
]
artifacts = []
for path in paths:
    before = path.stat()
    if before.st_size == 0:
        raise RuntimeError(f'Artifact is empty; wait for packaging to finish: {path}')
    digest = sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError(f'Artifact changed while hashing; wait for packaging to finish: {path}')
    artifacts.append({'path': path.relative_to(root).as_posix(), 'bytes': after.st_size, 'sha256': digest.hexdigest()})
manifest = {'version': version, 'artifacts': artifacts}
(release_dir / 'artifact-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
