import re, sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Cowork\Reports Apk\www\index.html', encoding='utf-8') as f:
    content = f.read()

strs = set()
# Find double-quoted strings
PAT_D = re.compile(r'"([^"\\\n]{2,200})"')
PAT_S = re.compile(r"'([^'\\\n]{2,200})'")
for m in PAT_D.finditer(content):
    s = m.group(1).strip()
    if 2 < len(s) < 200 and re.match(r'^[A-Z]', s) and len(s.split()) >= 2:
        strs.add(s)
for m in PAT_S.finditer(content):
    s = m.group(1).strip()
    if 2 < len(s) < 200 and re.match(r'^[A-Z]', s) and len(s.split()) >= 2:
        strs.add(s)

for s in sorted(strs):
    print(s)
