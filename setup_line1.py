import json, pathlib, re

# 1. Create line1.geojson
geojson = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [121.859585, 40.310644],
                    [121.923198, 40.321156],
                    [121.990872, 40.317025]
                ]
            }
        }
    ]
}
line1_path = pathlib.Path(r'e:\term\navi_navy\public\data\line1.geojson')
line1_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding='utf-8')
print('line1.geojson created')

# 2. Modify Console.tsx to add line1 source and layer
console_path = pathlib.Path(r'e:\term\navi_navy\src\pages\Console.tsx')
text = console_path.read_text(encoding='utf-8')

insert_code = """

        // 添加自定义 line1 线段
        try {
          m.addSource('line1', {
            type: 'geojson',
            data: '/data/line1.geojson',
          })
          m.addLayer({
            id: 'line1-line',
            type: 'line',
            source: 'line1',
            paint: {
              'line-color': '#4fd0c7',
              'line-width': 1,
              'line-dasharray': [4, 4],
            },
          })
          console.log('[Map] Line1 added')
        } catch (e) {
          console.warn('[Map] Failed to add line1:', e)
        }
"""

marker = "        // 添加自定义航行区域面"
if marker in text and "id: 'line1-line'" not in text:
    text = text.replace(marker, insert_code + "\n" + marker)
    console_path.write_text(text, encoding='utf-8')
    print('Console.tsx updated')
else:
    print('Console.tsx already has line1 or marker not found')
