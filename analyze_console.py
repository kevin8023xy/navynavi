import re
import os
import glob

# Find the file
files = glob.glob(os.path.join(r'e:\term\navi_navy', '*14*56*54*.html'))
if not files:
    print("File not found")
    exit(1)

target_file = files[0]
print(f"Found file: {target_file}")

with open(target_file, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
print(f"Total lines: {len(lines)}")
if len(lines) >= 5:
    print(f"Line 5 length: {len(lines[4])}")

# Extract visible text
text_seen = set()
print("\n=== Visible Text Content ===")
for m in re.finditer(r'>([^<]{2,100})<', content):
    text = m.group(1).strip()
    if 2 < len(text) < 100 and text not in text_seen:
        # Filter CSS values
        if not re.match(r'^(0|1|none|auto|solid|relative|absolute|hidden|visible|static|inherit|initial|unset|#?[0-9a-f]{3,8}|rgba?\(|var\(--|[\d\.]+px|[\d\.]+em|[\d\.]+rem|[\d\.]+%|[\d\.]+deg|[\d\.]+s|[\d\.]+ms)$', text, re.I):
            text_seen.add(text)

for t in sorted(text_seen):
    print(t)

# Extract links
print("\n=== Links ===")
link_seen = set()
for m in re.finditer(r'(?:href|src)=["\']?([^"\'>\s]+)["\']?', content):
    url = m.group(1)
    if len(url) > 5 and not url.startswith('data:') and url not in link_seen:
        link_seen.add(url)
        print(url)

# Extract class names containing layout keywords
print("\n=== Layout Classes ===")
class_seen = set()
for m in re.finditer(r'class="([^"]*)"', content):
    classes = m.group(1).split()
    for c in classes:
        c = c.strip()
        if any(k in c.lower() for k in ['sidebar', 'header', 'toolbar', 'panel', 'menu', 'nav', 'content', 'main', 'footer', 'card', 'modal', 'drawer', 'split', 'grid', 'flex', 'layout', 'container', 'wrapper']):
            if c not in class_seen:
                class_seen.add(c)
                print(c)

# Extract button text specifically
print("\n=== Button / Action Text ===")
btn_seen = set()
for m in re.finditer(r'<button[^>]*>([^<]{1,50})</button>', content):
    text = m.group(1).strip()
    if text and text not in btn_seen:
        btn_seen.add(text)
        print(text)

# Extract input placeholders
print("\n=== Input Placeholders ===")
for m in re.finditer(r'placeholder="([^"]*)"', content):
    print(m.group(1))

# Extract any AIS/playback related words in text
print("\n=== AIS / Playback Keywords in Text ===")
ais_seen = set()
for m in re.finditer(r'(?i)\b(ais|playback|replay|track|recording|vessel|ship|maritime|nautical|route|trajectory|history|time range|start|end|search|filter|export|import)\b', content):
    word = m.group(1).lower()
    if word not in ais_seen:
        ais_seen.add(word)
for w in sorted(ais_seen):
    print(w)
