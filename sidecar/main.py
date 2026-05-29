"""
Video AI Studio — Python Sidecar (Mock Mode)
通过 localhost HTTP 暴露 AI 能力，MVP 阶段使用 mock 数据。
"""
import json
import os
import sys
import time
import random
import string
from pathlib import Path
from flask import Flask, request, jsonify

app = Flask(__name__)

MOCK_DIR = Path(__file__).parent / '.mock_output'
MOCK_DIR.mkdir(exist_ok=True)

def random_filename(ext: str = '.png') -> str:
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=12)) + ext

# ── Health Check ──────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'mode': 'mock',
        'gpu': False,
        'models': {
            'sdxl': 'mock',
            'ipadapter': 'mock',
            'cosyvoice': 'mock',
            'musetalk': 'mock',
            'depth_anything': 'mock',
        },
        'timestamp': time.time()
    })

# ── 图像生成 (Mock) ───────────────────────────────────────────

@app.route('/generate_image', methods=['POST'])
def generate_image():
    data = request.json or {}
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'image.png'

    # 创建一个 mock 的 1x1 PNG 文件
    mock_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
    output_path.write_bytes(mock_png)

    return jsonify({
        'path': str(output_path),
        'status': 'ok',
        'mock': True
    })

# ── TTS 生成 (Mock) ──────────────────────────────────────────

@app.route('/generate_tts', methods=['POST'])
def generate_tts():
    data = request.json or {}
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'audio.mp3'

    # 创建一个 mock 的空音频文件
    output_path.write_bytes(b'')

    text = data.get('text', '')
    duration = len(text) * 0.3  # 估算时长

    return jsonify({
        'path': str(output_path),
        'duration_sec': round(duration, 2),
        'status': 'ok',
        'mock': True
    })

# ── MuseTalk 口型同步 (Mock) ─────────────────────────────────

@app.route('/musetalk', methods=['POST'])
def musetalk():
    data = request.json or {}
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'video.mp4'

    # mock 空文件
    output_path.write_bytes(b'')

    return jsonify({
        'path': str(output_path),
        'duration_sec': data.get('duration_sec', 5),
        'status': 'ok',
        'mock': True
    })

# ── 2.5D 深度动画 (Mock) ─────────────────────────────────────

@app.route('/depth_animate', methods=['POST'])
def depth_animate():
    data = request.json or {}
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'video.mp4'

    output_path.write_bytes(b'')

    return jsonify({
        'path': str(output_path),
        'duration_sec': data.get('duration_sec', 5),
        'fps': 25,
        'status': 'ok',
        'mock': True
    })

# ── FaceID Embedding 提取 (Mock) ─────────────────────────────

@app.route('/extract_face_embedding', methods=['POST'])
def extract_face_embedding():
    data = request.json or {}
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'embedding.pt'

    # mock 空文件
    output_path.write_bytes(b'')

    return jsonify({
        'path': str(output_path),
        'status': 'ok',
        'mock': True
    })

# ── 主入口 ────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('SIDECAR_PORT', 18923))
    print(json.dumps({'port': port, 'ready': True, 'mode': 'mock'}), flush=True)
    app.run(host='127.0.0.1', port=port, debug=False)
