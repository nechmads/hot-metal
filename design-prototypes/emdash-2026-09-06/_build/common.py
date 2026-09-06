"""Shared plumbing for the concept builders: local font bundling, asset copying,
and small HTML helpers. Prototype-only tooling — the shipped concept folders are
plain static files that need none of this."""

import json, os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
RUN = os.path.dirname(HERE)
SHARED = os.path.join(RUN, "_shared")
FONT_SRC = os.path.join(SHARED, "fonts")
IMG_SRC = os.path.join(SHARED, "img")

with open(os.path.join(FONT_SRC, "faces.json")) as f:
    _FACES = json.load(f)


def font_css(keys):
    """@font-face rules for the given families, pointing at ./fonts/*.woff2."""
    return "\n".join(_FACES[k] for k in keys)


def _fonts_used(keys):
    files = set()
    for k in keys:
        files.update(re.findall(r"fonts/([\w.-]+\.woff2)", _FACES[k]))
    return sorted(files)


def prepare(out_dir, font_keys, images):
    """Create the concept directory with only the assets it actually references."""
    os.makedirs(out_dir, exist_ok=True)
    fdir = os.path.join(out_dir, "fonts")
    idir = os.path.join(out_dir, "img")
    for d in (fdir, idir):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    for f in _fonts_used(font_keys):
        shutil.copy2(os.path.join(FONT_SRC, f), os.path.join(fdir, f))
    for i in images:
        shutil.copy2(os.path.join(IMG_SRC, i), os.path.join(idir, i))


def write(out_dir, name, html):
    with open(os.path.join(out_dir, name), "w") as f:
        f.write(html)
    return os.path.join(out_dir, name)


def body_with_ids(body, sections):
    """Give the article's <h2>s stable ids so in-page tables of contents work."""
    ids = [s[0] for s in sections]
    out, i = [], 0
    for chunk in re.split(r"(<h2>)", body):
        if chunk == "<h2>" and i < len(ids):
            out.append('<h2 id="%s">' % ids[i]); i += 1
        else:
            out.append(chunk)
    return "".join(out)


def all_images():
    return sorted(f for f in os.listdir(IMG_SRC) if f.endswith(".jpg"))
