#!/usr/bin/env python3
"""Run this after you change style.css, app.js, fx.js or pwa.js (or any image):

    python bump-version.py

It writes a fresh "?v=<hash>" behind each file in index.html and refreshes the cache version in sw.js,
so visitors and installed apps get the new files at once and never mix a new page with an old script.
"""
import datetime, hashlib, re, sys

FILES = ["style.css", "app.js", "fx.js", "pwa.js"]
IMAGES = ["logo.webp", "favicon-32.png", "app-icon.webp", "c130-front.webp", "c130-side.webp", "c130-rear34.webp"]


def digest(name):
    with open(name, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def main():
    hashes = {f: digest(f) for f in FILES}
    html = open("index.html", encoding="utf-8").read()
    for f in FILES:
        html, n = re.subn(re.escape(f) + r"\?v=[0-9a-f]+", f + "?v=" + hashes[f], html)
        if n == 0:
            sys.exit("index.html has no reference to " + f)
    open("index.html", "w", encoding="utf-8").write(html)

    everything = "".join(hashes[f] for f in FILES) + "".join(digest(i) for i in IMAGES)
    version = datetime.date.today().isoformat() + "-" + hashlib.sha1(everything.encode()).hexdigest()[:8]
    sw = open("sw.js", encoding="utf-8").read()
    assets = ", ".join("'/%s?v=%s'" % (f, hashes[f]) for f in FILES)
    sw = re.sub(r"const VERSION = '[^']*';", "const VERSION = '%s';" % version, sw)
    sw = re.sub(r"/\* BUMP:ASSETS \*/.*?/\* /BUMP \*/", "/* BUMP:ASSETS */\nconst ASSETS = [%s];\n/* /BUMP */" % assets, sw, flags=re.S)
    open("sw.js", "w", encoding="utf-8").write(sw)
    print("cache version:", version)
    for f in FILES:
        print("  %-10s ?v=%s" % (f, hashes[f]))


if __name__ == "__main__":
    main()
