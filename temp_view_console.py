import pathlib
p = pathlib.Path(r'e:\term\navi_navy\src\pages\Console.tsx')
text = p.read_text(encoding='utf-8')
start = text.find('zone-polygon-fill')
print(text[start:start+800])
