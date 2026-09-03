import requests, json, base64
from PIL import Image
import io

img = Image.new('RGB', (100, 100), color = 'black')
buf = io.BytesIO()
img.save(buf, format='JPEG')
img_str = base64.b64encode(buf.getvalue()).decode('utf-8')

payload = {
    'model': 'qwen3.8:latest',
    'messages': [
        {'role': 'system', 'content': '[REASONING DIRECTIVE]: Use minimal low reasoning (under 2 lines) strictly to verify coordinates/axes, then produce output.'},
        {'role': 'user', 'content': 'Return STRICTLY this JSON:\n{\n  \"page_annotations\": []\n}', 'images': [img_str]}
    ],
    'stream': False,
    'format': 'json',
    'options': {
        'num_ctx': 16384,
        'num_predict': 2048,
        'temperature': 0.1
    }
}
resp = requests.post('http://localhost:11434/api/chat', json=payload)
print(resp.status_code)
if resp.status_code != 200:
    print(resp.text)
else:
    print(resp.json()['message']['content'])
