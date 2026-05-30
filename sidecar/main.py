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
    import time as _time
    import requests as _requests
    data = request.json or {}
    prompt = data.get('prompt', '')
    character_id = data.get('character_id', 'unknown')
    api_key = data.get('api_key', '')
    model = data.get('model', 'wan2.7-image-pro')
    size = data.get('size', '1024*1024')
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = data.get('filename', character_id) + '.png'
    output_path = output_dir / filename

    print(f'[generate_image] character_id={character_id}, model={model}', flush=True)
    print(f'[generate_image] prompt={prompt[:120]}...', flush=True)
    print(f'[generate_image] output_path={output_path}', flush=True)

    if api_key:
        # ── 调用阿里百炼 DashScope API ──
        try:
            import dashscope
            from dashscope.aigc.image_generation import ImageGeneration
            from dashscope.api_entities.dashscope_response import Message

            dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

            message = Message(role='user', content=[{'text': prompt}])
            print(f'[generate_image] calling DashScope model={model}...', flush=True)

            rsp = ImageGeneration.call(
                model=model,
                api_key=api_key,
                messages=[message],
                n=1,
                size=size,
            )

            print(f'[generate_image] DashScope response status={rsp.status_code}', flush=True)

            if rsp.status_code == 200:
                # 解析响应，提取图片 URL
                img_url = None

                # 格式1: choices[0].message.content[0].image（wan2.7-image-pro）
                choices = rsp.output.get('choices', [])
                if choices:
                    content = choices[0].get('message', {}).get('content', [])
                    for item in content:
                        if item.get('type') == 'image' and item.get('image'):
                            img_url = item['image']
                            break

                # 格式2: output.results[0].url（旧版接口）
                if not img_url:
                    results = rsp.output.get('results', [])
                    if results and results[0].get('url'):
                        img_url = results[0]['url']

                if img_url:
                    print(f'[generate_image] downloading from: {img_url[:100]}...', flush=True)
                    img_resp = _requests.get(img_url, timeout=120)
                    output_path.write_bytes(img_resp.content)
                    file_size = output_path.stat().st_size
                    print(f'[generate_image] saved: {output_path} ({file_size} bytes)', flush=True)
                    return jsonify({'path': str(output_path), 'status': 'ok', 'mock': False})

                # 异步任务：轮询
                task_id = rsp.output.get('task_id', '')
                if task_id:
                    print(f'[generate_image] async task_id={task_id}, polling...', flush=True)
                    for i in range(60):
                        _time.sleep(2)
                        poll = ImageGeneration.fetch(task_id=task_id, api_key=api_key)
                        task_status = poll.output.get('task_status', '')
                        print(f'[generate_image] poll {i+1}: status={task_status}', flush=True)
                        if task_status == 'SUCCEEDED':
                            poll_choices = poll.output.get('choices', [])
                            if poll_choices:
                                poll_content = poll_choices[0].get('message', {}).get('content', [])
                                for item in poll_content:
                                    if item.get('type') == 'image' and item.get('image'):
                                        img_url = item['image']
                                        break
                            if not img_url:
                                poll_results = poll.output.get('results', [])
                                if poll_results and poll_results[0].get('url'):
                                    img_url = poll_results[0]['url']
                            if img_url:
                                img_resp = _requests.get(img_url, timeout=120)
                                output_path.write_bytes(img_resp.content)
                                file_size = output_path.stat().st_size
                                print(f'[generate_image] saved: {output_path} ({file_size} bytes)', flush=True)
                                return jsonify({'path': str(output_path), 'status': 'ok', 'mock': False})
                            break
                        elif task_status == 'FAILED':
                            print(f'[generate_image] task FAILED: {poll.output}', flush=True)
                            return jsonify({'error': str(poll.output), 'status': 'failed'}), 500

                print(f'[generate_image] unexpected response: {rsp.output}', flush=True)
                return jsonify({'error': f'无法获取图片', 'status': 'failed'}), 500
            else:
                print(f'[generate_image] DashScope error: {rsp.code} - {rsp.message}', flush=True)
                return jsonify({'error': f'{rsp.code}: {rsp.message}', 'status': 'failed'}), 500

        except Exception as e:
            print(f'[generate_image] DashScope exception: {e}', flush=True)
            return jsonify({'error': str(e), 'status': 'failed'}), 500

    # ── Mock 模式 ──
    print(f'[generate_image] no api_key, using mock mode', flush=True)
    import struct, zlib
    width, height = 200, 200
    raw = b''
    for y in range(height):
        raw += b'\x00' + b'\x80\x80\x80' * width
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', zlib.compress(raw))
    png += chunk(b'IEND', b'')
    output_path.write_bytes(png)
    file_size = output_path.stat().st_size
    print(f'[generate_image] mock saved: {output_path} ({file_size} bytes)', flush=True)

    return jsonify({
        'path': str(output_path),
        'status': 'ok',
        'mock': True
    })

# ── 视频生成（DashScope HappyHorse）─────────────────────────────

@app.route('/generate_video', methods=['POST'])
def generate_video():
    import time as _time
    import requests as _requests
    data = request.json or {}
    prompt = data.get('prompt', '')
    api_key = data.get('api_key', '')
    model = data.get('model', 'happyhorse-1.0-t2v')
    resolution = data.get('resolution', '720P')
    ratio = data.get('ratio', '16:9')
    duration = data.get('duration', 5)
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = data.get('filename', 'video') + '.mp4'
    output_path = output_dir / filename

    print(f'[generate_video] model={model}, resolution={resolution}, ratio={ratio}, duration={duration}s', flush=True)
    print(f'[generate_video] prompt={prompt[:120]}...', flush=True)

    if not api_key:
        print('[generate_video] no api_key, using mock mode', flush=True)
        output_path.write_bytes(b'')
        return jsonify({'path': str(output_path), 'status': 'ok', 'mock': True})

    try:
        # 步骤1：创建异步任务
        url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
        headers = {
            'X-DashScope-Async': 'enable',
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }
        body = {
            'model': model,
            'input': {'prompt': prompt},
            'parameters': {
                'resolution': resolution,
                'ratio': ratio,
                'duration': duration,
                'watermark': False,
            }
        }
        print(f'[generate_video] creating task...', flush=True)
        resp = _requests.post(url, json=body, headers=headers, timeout=30)
        result = resp.json()

        if 'output' not in result or 'task_id' not in result.get('output', {}):
            print(f'[generate_video] create task failed: {result}', flush=True)
            return jsonify({'error': result.get('message', str(result)), 'status': 'failed'}), 500

        task_id = result['output']['task_id']
        print(f'[generate_video] task_id={task_id}, polling...', flush=True)

        # 步骤2：轮询任务结果
        poll_url = f'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}'
        poll_headers = {'Authorization': f'Bearer {api_key}'}

        for i in range(60):  # 最多轮询 60 次，每次间隔 15 秒
            _time.sleep(15)
            poll_resp = _requests.get(poll_url, headers=poll_headers, timeout=30)
            poll_result = poll_resp.json()
            task_status = poll_result.get('output', {}).get('task_status', '')
            print(f'[generate_video] poll {i+1}: status={task_status}', flush=True)

            if task_status == 'SUCCEEDED':
                video_url = poll_result['output'].get('video_url', '')
                if video_url:
                    print(f'[generate_video] downloading from {video_url[:100]}...', flush=True)
                    video_resp = _requests.get(video_url, timeout=120)
                    output_path.write_bytes(video_resp.content)
                    file_size = output_path.stat().st_size
                    print(f'[generate_video] saved: {output_path} ({file_size} bytes)', flush=True)
                    return jsonify({'path': str(output_path), 'status': 'ok', 'mock': False})
                return jsonify({'error': 'SUCCEEDED but no video_url', 'status': 'failed'}), 500

            elif task_status == 'FAILED':
                error_msg = poll_result.get('output', {}).get('message', 'Unknown error')
                print(f'[generate_video] task FAILED: {error_msg}', flush=True)
                return jsonify({'error': error_msg, 'status': 'failed'}), 500

            elif task_status in ('PENDING', 'RUNNING'):
                continue

        print('[generate_video] polling timeout (15 min)', flush=True)
        return jsonify({'error': '视频生成超时（15分钟）', 'status': 'timeout'}), 500

    except Exception as e:
        print(f'[generate_video] exception: {e}', flush=True)
        return jsonify({'error': str(e), 'status': 'failed'}), 500

# ── 图生视频（DashScope Wan）───────────────────────────────────

@app.route('/generate_i2v', methods=['POST'])
def generate_i2v():
    """图生视频：支持首帧图、首尾帧两种模式"""
    import time as _time
    import requests as _requests
    data = request.json or {}
    prompt = data.get('prompt', '')
    api_key = data.get('api_key', '')
    model = data.get('model', 'wan2.6-i2v-flash')
    image_url = data.get('image_url', '')          # 首帧图 URL 或 base64
    end_image_url = data.get('end_image_url', '')  # 尾帧图 URL（可选）
    resolution = data.get('resolution', '720P')
    ratio = data.get('ratio', '16:9')
    duration = data.get('duration', 5)
    output_dir = Path(data.get('output_dir', str(MOCK_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = data.get('filename', 'i2v_video') + '.mp4'
    output_path = output_dir / filename

    print(f'[generate_i2v] model={model}, resolution={resolution}, ratio={ratio}', flush=True)
    print(f'[generate_i2v] prompt={prompt[:100]}...', flush=True)
    print(f'[generate_i2v] image_url={image_url[:80] if image_url else "(empty)"}...', flush=True)

    if not api_key:
        print('[generate_i2v] no api_key, using mock mode', flush=True)
        output_path.write_bytes(b'')
        return jsonify({'path': str(output_path), 'status': 'ok', 'mock': True})

    try:
        # 本地文件路径转 file:// URL
        if image_url and not image_url.startswith(('http://', 'https://', 'data:')):
            if not image_url.startswith('file://'):
                image_url = 'file://' + image_url
        if end_image_url and not end_image_url.startswith(('http://', 'https://', 'data:')):
            if not end_image_url.startswith('file://'):
                end_image_url = 'file://' + end_image_url

        # 构建请求体
        url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
        headers = {
            'X-DashScope-Async': 'enable',
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }
        body = {
            'model': model,
            'input': {
                'prompt': prompt,
                'img_url': image_url,
            },
            'parameters': {
                'resolution': resolution,
                'ratio': ratio,
                'duration': duration,
                'watermark': False,
                'prompt_extend': True,
            }
        }
        # 首尾帧模式
        if end_image_url:
            body['input']['end_img_url'] = end_image_url

        print(f'[generate_i2v] creating task with model={model}...', flush=True)
        resp = _requests.post(url, json=body, headers=headers, timeout=30)
        result = resp.json()

        if 'output' not in result or 'task_id' not in result.get('output', {}):
            print(f'[generate_i2v] create task failed: {result}', flush=True)
            return jsonify({'error': result.get('message', str(result)), 'status': 'failed'}), 500

        task_id = result['output']['task_id']
        print(f'[generate_i2v] task_id={task_id}, polling...', flush=True)

        # 轮询任务结果
        poll_url = f'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}'
        poll_headers = {'Authorization': f'Bearer {api_key}'}

        for i in range(60):
            _time.sleep(15)
            poll_resp = _requests.get(poll_url, headers=poll_headers, timeout=30)
            poll_result = poll_resp.json()
            task_status = poll_result.get('output', {}).get('task_status', '')
            print(f'[generate_i2v] poll {i+1}: status={task_status}', flush=True)

            if task_status == 'SUCCEEDED':
                video_url = poll_result['output'].get('video_url', '')
                if video_url:
                    print(f'[generate_i2v] downloading from {video_url[:100]}...', flush=True)
                    video_resp = _requests.get(video_url, timeout=120)
                    output_path.write_bytes(video_resp.content)
                    file_size = output_path.stat().st_size
                    print(f'[generate_i2v] saved: {output_path} ({file_size} bytes)', flush=True)
                    return jsonify({'path': str(output_path), 'status': 'ok', 'mock': False})
                return jsonify({'error': 'SUCCEEDED but no video_url', 'status': 'failed'}), 500

            elif task_status == 'FAILED':
                error_msg = poll_result.get('output', {}).get('message', 'Unknown error')
                print(f'[generate_i2v] task FAILED: {error_msg}', flush=True)
                return jsonify({'error': error_msg, 'status': 'failed'}), 500

        print('[generate_i2v] polling timeout (15 min)', flush=True)
        return jsonify({'error': '图生视频超时（15分钟）', 'status': 'timeout'}), 500

    except Exception as e:
        print(f'[generate_i2v] exception: {e}', flush=True)
        return jsonify({'error': str(e), 'status': 'failed'}), 500

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
